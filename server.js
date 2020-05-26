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


async function testEnv(padCount){
  // create padCount new pads and return an array

}


async function babble(sock, topic){
  const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789          '
  let s = [...Array(56)].map(_ => c[~~(Math.random()*c.length)]).join('')

  for (i=0; i < 100+ Math.random()*1000; ++i){
    await sock.send([topic, `${s}\n`]);
    s = [...Array(56)].map(_ => c[~~(Math.random()*c.length)]).join('')
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await sock.send([topic, "done"]);
};

async function runServer(){
  // socket used to send work
  const sock = new zmq.Publisher;
  let ccHost = 'tcp://127.0.0.1';
  sock.bind(`${ccHost}:3001`);
  console.log("Publish socket connected");

  // socket used to coordinate
  const ccSock = new zmq.Pull;
  await ccSock.bind(`${ccHost}:3000`);
  console.log("CC link established");

  for await (const [msg] of ccSock) {
    var topic = msg.toString();
    console.log("New worker connected: %s", topic);
    babble(sock, topic);
  }
};

(async () => {
  try {
    await runServer();
  } catch (e) {
    // Deal with the fact the chain failed
    console.log(e);
  }
})();
