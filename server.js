const yargs = require('yargs');
const zmq = require("zeromq");
/* Do a stress test of an etherpad-lite server
 * Use zeromq to coordinate a bunch of workers to participate on the pads
 * What should the workers do?
 *  - Connect to the pad
 *  - Post test to the pad
 * What should a worker measure
 *  - Time from navigation until page is ready
 *  - Total amount of text contributed to etherpads
 * What does the server do
 *  - Wait for enough workers to connect
 *  - Send URLs that should be connected to
 *  - Gather metrics taken
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
  .option('required-workers', {
    alias: 'w',
    type: 'int',
    default: 10,
  })
  .help()
  .alias('help', 'h')
  .argv;


async function testEnv(padCount){
  // create padCount new pads and return an array

}

async function runServer(bindAddress, etherpadServer){
  const requiredWorkers = argv['required-workers'];
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
    let url = `${etherpadServer}/p/testpad`;
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
