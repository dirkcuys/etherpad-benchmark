# Etherpad benchmarking

Test Etherpad using a client/server architecture to orchestrate multiple workers to connect and interact with an etherpad server using headless chrome. Each worker interacts with the etherpad for a random amount of time and sends the following metrics back to the server: time taken to load etherpad, number of characters submitted to the therpad.

usage:

    docker build . -t etherpad-bench
    docker run -it --rm -p 3000:3000 -p 3001:3001 -p 3002:3002 --name coord etherpad-bench node server.js -H https://<ETHERPAD_SERVER_URL> -b 0.0.0.0
    docker run --rm -d -i -t --link coord etherpad-bench node client.js -b coord

For larger scale tests, it is recommended to use something like terraform to provision infrastructure and ansible to setup the servers. See terra.tf and ansible/ for an example of how this can be done.
