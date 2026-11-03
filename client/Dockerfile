# Frontend container
# -----------------------------------------------------------------------------
# React compiles down to static HTML, CSS and JavaScript. There is no Node
# process in production - we build the files, then serve them with Nginx, which
# is far faster and smaller than keeping Node running.

FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines environment variables at BUILD time, not run time, because the
# output is static files. Anything needed by the browser must be present now.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build


FROM nginx:alpine AS runtime

# Only the compiled output is copied. Source code and node_modules never ship.
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
