const yargs = require('yargs');
const zmq = require("zeromq");
const https = require("https");
const querystring = require('querystring');
/* Do a stress test of an etherpad-lite server. The idea is to create a realistic workload on the server using distributed workers
 * At the end, I'd like to be able to measure any increase, decrease in performance
 * Workers
 *  - Start up headless chrome
 *  - Wait for pad URL
 *  - Connect to the pad
 *  - Interact with the pad for some time
 *  - Report results
 *     - Time from navigation until page is ready
 *     - Total amount of text contributed to etherpads
 * Server
 *  - Create 1 or more etherpads to use for testing
 *  - When a worker connects, assign it to a pad
 *  - Send URLs that should be connected to
 *  - Gather metrics taken
 *  - Keep track of how many workers are active
 */

const argv = yargs
  .option('bind-address', {
    alias: 'b',
    description: 'Address the server will bind to',
    default: '127.0.0.1',
    type: 'string',
  })
  .option('etherpad-server', {
    alias: 'H',
    demandOption: true,
    description: 'Etherpad server',
    type: 'string',
  })
  .option('etherpad-api-key', {
    alias: 'K',
    demandOption: true,
    description: 'Etherpad API KEY',
    type: 'string',
  })
  .option('required-workers', {
    alias: 'w',
    type: 'int',
    default: 10,
  })
  .help()
  .alias('help', 'h')
  .argv;


async function createPad(serverUrl, apikey, padID, text){
  // create a new etherpad
  const postData = querystring.stringify({text});
  const url = `${serverUrl}/api/1/createPad?apikey=${apikey}&padID=${padID}&text=${postData}`;
  //console.log(url);
  const response = await new Promise( (resolve, reject) => {
    console.log(`create pad ${padID}`);
    const req = https.request(url, {
      //method: 'POST',
      //headers: {
      //  'Content-Type': 'application/x-www-form-urlencoded',
      //  'Content-Length': Buffer.byteLength(postData)
      //}
    }, res => {
      let body = "";
      res.on("data", data => {
        body += data;
      });
      res.on('end', () => {
        resolve(body);
      });
    });
    //req.write(postData);
    req.end();
  });
  console.log(response);
}

async function runServer(bindAddress, etherpadServer){
  const apikey = argv['etherpad-api-key'];
  const requiredWorkers = argv['required-workers'];
  await createPad(etherpadServer, apikey, 'test112233', 'This is a new pad to be used for testing');

  let ccHost = `tcp://${bindAddress}`;
  // socket used to coordinate
  const ccSock = new zmq.Pull;
  await ccSock.bind(`${ccHost}:3000`);
  // socket used to send work
  const sock = new zmq.Publisher;
  await sock.bind(`${ccHost}:3001`);
  // socket for results
  const rSock = new zmq.Pull;
  await rSock.bind(`${ccHost}:3002`);

  console.log(`Listening on ${ccHost}:3000, ${ccHost}:3001 and ${ccHost}:3002`);
  let workers = new Map;
  for await (const [msg] of ccSock) {
    var topic = msg.toString();
    console.log("New worker connected: %s", topic);
    let url = `${etherpadServer}/p/test112233`;
    workers.set(topic, url);
    await sock.send([topic, JSON.stringify({url})]);
    if (workers.size >= requiredWorkers) {
      console.log('All needed workers aquired');
      break;
    }
  }

  console.log('waiting for results');
  for await (const [msg] of rSock) {
    var result = msg.toString();
    console.log(result);
  };

};

(async () => {
  try {
    await runServer(argv['bind-address'], argv['etherpad-server']);
  } catch (e) {
    console.log(e);
  }
})();
