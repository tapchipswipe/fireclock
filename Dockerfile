# FireClock — static Fire TV clock/calendar served by Nginx (Alpine).
FROM nginx:alpine

# Custom nginx config: serves static files AND proxies calendar .ics
# feeds under /cal/N to bypass browser CORS.
COPY nginx.conf /etc/nginx/nginx.conf

# Copy the static frontend (HTML/CSS/JS) into the web root.
COPY index.html style.css script.js /usr/share/nginx/html/

EXPOSE 80

# Serve via our config; stays read-only friendly (pid/log to /tmp|stdout).
CMD ["nginx", "-g", "daemon off;"]