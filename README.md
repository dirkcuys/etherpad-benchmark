Run a bench test against an etherpad server

usage:

    docker build . -t etherpad-bench
    docker run -it --rm -p 3000:3000 -p 3001:3001 -p 3002:3002 --name coord etherpad-bench node server.js -H https://URL -b 0.0.0.0
    docker run --rm -d -i -t --link coord etherpad-bench node client.js -b coord
