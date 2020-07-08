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
  .option('max-workers', {
    alias: 'w',
    type: 'int',
    default: 0,
    description: 'Max number of workers to run, 0 disables the limit.',
  })
  .option('pad-count', {
    alias: 'p',
    type: 'int',
    default: 1,
    description: 'Max number of workers to run, 0 disables the limit.',
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
  return `${serverUrl}/p/${padID}`;
}

async function runServer(bindAddress, etherpadServer){
  const apikey = argv['etherpad-api-key'];
  const maxWorkers = argv['max-workers'];

  let pads = {};
  const padCount = argv['pad-count'];
  for (let i = 0; i < padCount; i++){
    let padUrl = await createPad(etherpadServer, apikey, `test-pad-${i}`, 'This is a new pad to be used for testing');
    pads[padUrl] = {workers: []};
  }

  let ccHost = `tcp://${bindAddress}`;
  // socket used to send work
  const sock = new zmq.Reply;
  await sock.bind(`${ccHost}:3001`);
  // socket for results
  const rSock = new zmq.Pull;
  await rSock.bind(`${ccHost}:3002`);

  console.log(`Listening on ${ccHost}:3001 and ${ccHost}:3002`);
  let workers = new Map;
  let workerCount = 0;

  // Create a promise chain to handle new workers
  let workQueue = async msg => {
    var topic = msg.toString();
    workerCount++;
    console.log(`${new Date().toISOString()}, connected, ${topic}, ${workerCount}`);

    // Pick a pad
    let url = Object.keys(pads)[Math.floor(Math.random() * Object.keys(pads).length)];
    workers.set(topic, {url});
    await sock.send(JSON.stringify({url}));
    if (maxWorkers && workers.size >= maxWorkers) {
      console.log(`${new Date().toISOString()}, server done`);
      return sock.close();
    } else {
      // wait for ~200 ms
      await new Promise(resolve => setTimeout(resolve, Math.round(1 + Math.random()*200) ));
      return sock.receive().then(workQueue);
    }
  };
  let workerQueueDone = sock.receive().then(workQueue);

  console.log('waiting for results');
  for await (const [msg] of rSock) {
    var result = msg.toString();
    let {worker, loadTime, characterCount, error} = JSON.parse(result);
    let pad = workers.get(worker).url;
    console.log(`${new Date().toISOString()}, result, ${[worker, pad, loadTime, characterCount, error].join(', ')}`);
    workerCount--;
    if (workerCount == 0 && workers.size == maxWorkers){
      console.log('Received all results');
      break;
    }
  };
};

(async () => {
  try {
    await runServer(argv['bind-address'], argv['etherpad-server']);
  } catch (e) {
    console.log(e);
  }
})();
