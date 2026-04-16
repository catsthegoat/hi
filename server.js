const express = require("express");
const http = require("http");
const https = require("https");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from root
app.use(express.static(__dirname));

// PROXY ROUTE
app.get("/proxy", (req, res) => {
  const target = req.query.url;
  if (!target) return res.sendFile(path.join(__dirname, "proxy.html"));

  let targetUrl;
  try {
    targetUrl = new URL(target.startsWith("http") ? target : "https://" + target);
  } catch(e) {
    targetUrl = new URL("https://www.google.com/search?q=" + encodeURIComponent(target));
  }

  const isHttps = targetUrl.protocol === "https:";
  const lib = isHttps ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "identity",
      "Connection": "keep-alive"
    }
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    let ct = proxyRes.headers["content-type"] || "";

    if ([301,302,303,307,308].includes(proxyRes.statusCode)) {
      let loc = proxyRes.headers["location"] || "";
      if (loc.startsWith("/")) loc = targetUrl.origin + loc;
      return res.redirect("/proxy?url=" + encodeURIComponent(loc));
    }

    res.setHeader("content-type", ct);

    if (ct.includes("text/html")) {
      let body = "";
      proxyRes.setEncoding("utf8");
      proxyRes.on("data", chunk => body += chunk);
      proxyRes.on("end", () => {
        const base = targetUrl.origin;
        const inject = `<script>
(function(){
  const BASE = ${JSON.stringify(base)};
  const PROXY = "/proxy?url=";
  function rewrite(u){
    if(!u||u.startsWith("data:")||u.startsWith("javascript:")||u.startsWith("#")||u.startsWith("mailto:")) return u;
    if(u.startsWith("http")) return PROXY+encodeURIComponent(u);
    if(u.startsWith("//")) return PROXY+encodeURIComponent("https:"+u);
    if(u.startsWith("/")) return PROXY+encodeURIComponent(BASE+u);
    return PROXY+encodeURIComponent(BASE+"/"+u);
  }
  document.addEventListener("DOMContentLoaded",function(){
    document.querySelectorAll("a[href]").forEach(a=>{try{a.href=rewrite(a.getAttribute("href"));}catch(e){}});
    document.querySelectorAll("form[action]").forEach(f=>{try{f.action=rewrite(f.getAttribute("action"));}catch(e){}});
  });
  const _fetch=window.fetch;
  window.fetch=function(u,...a){if(typeof u==="string"&&u.startsWith("http"))u=PROXY+encodeURIComponent(u);return _fetch(u,...a);};
  const _open=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u,...a){if(typeof u==="string"&&u.startsWith("http"))u=PROXY+encodeURIComponent(u);return _open.call(this,m,u,...a);};
})();
</script>`;
        body = body.replace("</head>", inject + "</head>");
        res.send(body);
      });
    } else {
      proxyRes.pipe(res);
    }
  });

  proxyReq.on("error", (e) => {
    res.status(500).send(`<html><body style="background:#0a0a0f;color:#fff;font-family:sans-serif;padding:40px;text-align:center">
      <h2>Proxy Error</h2><p>${e.message}</p>
      <a href="/proxy" style="color:#aaa">← Go back</a></body></html>`);
  });

  proxyReq.end();
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.listen(PORT, () => console.log("Pioneers Rooms running on port " + PORT));
