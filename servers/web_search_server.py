# import json
# import requests
# from mcp import Server, Tool

# app = Server()

# @app.tool(name="web_search", description="Search the web for relevant information")
# def web_search(search_term: str):
#     # 👉 Replace with your real search logic / API
#     # Here’s a dummy stub that returns the query back plus a fake result.
#     return {
#         "query": search_term,
#         "results": [
#             {"title": "Example result for " + search_term, "link": "https://example.com"}
#         ]
#     }

# if __name__ == "__main__":
#     app.serve_stdio()  # Listens on stdin/stdout for the MCP protocol