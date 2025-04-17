from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import asyncio
import shutil
import json
from contextlib import AsyncExitStack
from uuid import uuid4
import tempfile

import openai
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
load_dotenv()
OPENAI_API_KEY = os.getenv("LLM_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("LLM_API_KEY environment variable not set")

# Pydantic models for API payloads
class ServerConfig(BaseModel):
    name: str
    command: str
    args: List[str]
    env: Optional[Dict[str, str]] = None

class ToolInfo(BaseModel):
    name: str
    description: str
    input_schema: Dict[str, Any]

class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str

class ChatResponse(BaseModel):
    session_id: str
    response: str

# MCP Server wrapper
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

class MCPServer:
    def __init__(self, config: ServerConfig):
        self.name = config.name
        self.config = config
        self.session: ClientSession = None  # type: ignore
        self.exit_stack = AsyncExitStack()
        self._npm_cache_dir = None

    async def start(self):
        command = shutil.which(self.config.command) or self.config.command
        # Prepare environment, isolating npx cache if needed
        env = {**os.environ, **(self.config.env or {})}
        if os.path.basename(command) == 'npx':
            # create a dedicated npm cache for this process
            self._npm_cache_dir = tempfile.mkdtemp(prefix='mcp_npx_cache_')
            env['npm_config_cache'] = self._npm_cache_dir
            env['XDG_CACHE_HOME'] = self._npm_cache_dir
        params = StdioServerParameters(
            command=command,
            args=self.config.args,
            env=env,
        )
        # Initialize stdio transport and MCP client session
        transport = await self.exit_stack.enter_async_context(stdio_client(params))
        read, write = transport
        session = await self.exit_stack.enter_async_context(
            ClientSession(read, write)
        )
        await session.initialize()
        self.session = session

    async def list_tools(self) -> List[ToolInfo]:
        tools_response = await self.session.list_tools()
        result: List[ToolInfo] = []
        for item in tools_response:
            if isinstance(item, tuple) and item[0] == "tools":
                for tool in item[1]:
                    # Coerce None descriptions and input schemas to defaults
                    desc = tool.description or ""
                    schema = tool.inputSchema or {}
                    result.append(
                        ToolInfo(
                            name=tool.name,
                            description=desc,
                            input_schema=schema,
                        )
                    )
        return result

    async def call_tool(self, name: str, arguments: dict):
        return await self.session.call_tool(name, arguments)

    async def stop(self):
        await self.exit_stack.aclose()
        # clean up temporary npm cache directory
        if self._npm_cache_dir and os.path.exists(self._npm_cache_dir):
            shutil.rmtree(self._npm_cache_dir, ignore_errors=True)

# Manager for multiple MCP servers
class ServerManager:
    def __init__(self):
        self.servers: Dict[str, MCPServer] = {}
        self._lock = asyncio.Lock()

    async def add_server(self, config: ServerConfig):
        async with self._lock:
            if config.name in self.servers:
                raise HTTPException(status_code=400, detail="Server already exists")
            server = MCPServer(config)
            try:
                await server.start()
            except Exception as e:
                # Clean up any partial server on failure
                try:
                    await server.stop()
                except:
                    pass
                raise HTTPException(status_code=500, detail=f"Error starting server '{config.name}': {e}")
            self.servers[config.name] = server

    async def remove_server(self, name: str):
        async with self._lock:
            server = self.servers.get(name)
            if not server:
                raise HTTPException(status_code=404, detail="Server not found")
            await server.stop()
            del self.servers[name]

    async def list_servers(self) -> List[str]:
        return list(self.servers.keys())

    async def list_tools(self, name: Optional[str] = None) -> List[ToolInfo]:
        if name:
            server = self.servers.get(name)
            if not server:
                raise HTTPException(status_code=404, detail="Server not found")
            return await server.list_tools()
        # list all
        all_tools: List[ToolInfo] = []
        for server in self.servers.values():
            all_tools.extend(await server.list_tools())
        return all_tools

# Chat session manager
class ChatManager:
    def __init__(self, server_manager: ServerManager):
        self.sm = server_manager
        self.sessions: Dict[str, dict] = {}

    async def chat(self, req: ChatRequest) -> ChatResponse:
        sid = req.session_id or str(uuid4())
        if sid not in self.sessions:
            tools = await self.sm.list_tools()
            tools_desc = "\n".join([f"{t.name}: {t.description}" for t in tools])
            system_msg = (
                "You are a helpful assistant with access to these tools:\n"
                f"{tools_desc}\n\n"
                "When you need to use a tool, respond ONLY with a JSON object in the exact format below and nothing else:\n"
                "{\n"
                '    "tool": "tool-name",\n'
                '    "arguments": { /* argument names and values */ }\n'
                "}\n"
                "After the tool runs, you will receive the result and should continue the conversation naturally."
            )
            self.sessions[sid] = {"messages": [{"role": "system", "content": system_msg}]}
        session = self.sessions[sid]
        session["messages"].append({"role": "user", "content": req.message})
        # Prepare and call OpenAI with all MCP server tools as functions
        client = OpenAI(api_key=OPENAI_API_KEY)
        tools = await self.sm.list_tools()
        functions_defs = [
            {"name": t.name, "description": t.description, "parameters": t.input_schema}
            for t in tools
        ]
        resp = client.chat.completions.create(
            model="o4-mini",
            messages=session["messages"],
            functions=functions_defs,
            function_call="auto"
        )
        message = resp.choices[0].message
        # Handle tool invocation if selected
        if getattr(message, "function_call", None):
            func_name = message.function_call.name
            args = json.loads(message.function_call.arguments)
            try:
                result = await self.sm.call_tool(func_name, args)
                session["messages"].append({
                    "role": "function", "name": func_name, "content": json.dumps(result)
                })
                # Get final assistant reply
                resp2 = client.chat.completions.create(
                    model="o4-mini", messages=session["messages"]
                )
                final_msg = resp2.choices[0].message
                content = final_msg.content or ""
            except Exception as e:
                import traceback; traceback.print_exc()
                content = f"Error calling tool {func_name}: {e}"
        else:
            content = message.content or ""
        session["messages"].append({"role": "assistant", "content": content})
        # Ensure response is a string
        return ChatResponse(session_id=sid, response=content or "")

# Initialize FastAPI app
app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
sm = ServerManager()
cm = ChatManager(sm)

@app.post("/servers")
async def api_add_server(conf: ServerConfig):
    try:
        await sm.add_server(conf)
        return {"status": "ok"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error adding server: {e}")

@app.get("/servers")
async def api_list_servers():
    return await sm.list_servers()

@app.delete("/servers/{name}")
async def api_delete_server(name: str):
    await sm.remove_server(name)
    return {"status": "deleted"}

@app.get("/tools")
async def api_list_tools(server: Optional[str] = None):
    return await sm.list_tools(server)

@app.post("/chat", response_model=ChatResponse)
async def api_chat(req: ChatRequest):
    try:
        return await cm.chat(req)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
