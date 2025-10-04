// Simple static file server for frontend development
import { serve } from "bun";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PORT = 3000;
const PUBLIC_DIR = join(import.meta.dir, "../public");

console.log(`Starting frontend server on port ${PORT}`);
console.log(`Serving static files from: ${PUBLIC_DIR}`);

serve({
  port: PORT,
  fetch(request) {
    const url = new URL(request.url);
    let pathname = url.pathname;
    
    // Default to index.html for root path
    if (pathname === "/") {
      pathname = "/index.html";
    }
    
    const filePath = join(PUBLIC_DIR, pathname);
    
    // Check if file exists
    if (!existsSync(filePath)) {
      // For SPA routing, fallback to index.html
      const indexPath = join(PUBLIC_DIR, "index.html");
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath);
        return new Response(content, {
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response("File not found", { status: 404 });
    }
    
    try {
      const content = readFileSync(filePath);
      
      // Set appropriate content type
      let contentType = "text/plain";
      if (pathname.endsWith(".html")) contentType = "text/html";
      else if (pathname.endsWith(".css")) contentType = "text/css";
      else if (pathname.endsWith(".js")) contentType = "application/javascript";
      else if (pathname.endsWith(".json")) contentType = "application/json";
      
      return new Response(content, {
        headers: { 
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        },
      });
    } catch (error) {
      console.error("Error reading file:", error);
      return new Response("Internal server error", { status: 500 });
    }
  },
});

console.log(`Frontend server running at http://localhost:${PORT}`);