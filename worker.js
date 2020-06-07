const puppeteer = require('puppeteer');
const zmq = require("zeromq");
const os = require('os');
const yargs = require('yargs');

const argv = yargs
  .option('cc-address', {
    alias: 'b',
    description: 'Address of the control server',
    default: '127.0.0.1',
    type: 'string',
  })
  .help()
  .alias('help', 'h')
  .argv;

const maxWait = 30000;

function timeout(promise, ms, errorMsg){
  let timeoutHandle;
  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutHandle = setTimeout(reject, ms, new Error(errorMsg)) 
  });
  return Promise.race([
    promise,
    timeoutPromise,
  ]).then(result => {
    return result;
  }).finally(() => {
    clearTimeout(timeoutHandle);
  }); 
};

/* Loads an etherpad and returns the page object when the pad is ready to receive input */
async function loadEtherpad(page, url){
  //page.on('request', req => console.log(`${req.method()}: ${req.url()}`));
  //page.on('load', event => console.log('page loaded'));

  // add lister to wait for ace-inner iframe
  let aceInner = new Promise((resolve, reject) => {
    page.on('frameattached', frame => {
      if (frame.parentFrame() && frame.parentFrame().name() == 'ace_outer'){
        resolve(frame);
        //console.log('ace_inner attached');
      }
    });
  });

  await timeout(page.goto(url, {timeout: 0, waitUntil: 'networkidle0'}), maxWait, 'page navigation timeout');
  frame = await timeout(aceInner, maxWait, 'ace inner timeout');
  await timeout(frame.waitForSelector('div'), maxWait, 'selector timeout');
  return page;
}

async function babble(page){
  const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789            ';
  let count = 0;
  let lines = 60*(1 + Math.random())/2;
  for (i=0; i < lines; ++i){
    let s = [...Array(Math.round(8 + Math.random()*72))].map(_ => c[~~(Math.random()*c.length)]).join('');
    count += s.length;
    await page.keyboard.type(`${s}\n`, {delay: 10});
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return count;
};

async function runClient(ccHost){
  // This topic is unique to this worker
  let topic = `worker-${os.hostname()}-${process.pid}`;

  // socket for receiving commands
  const sock = new zmq.Request;
  sock.connect(`${ccHost}:3001`);

  const reSock = new zmq.Push;
  reSock.connect(`${ccHost}:3002`);

  // start up headless chrome
  const opts = {
    timeout: 10000,
    //headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  let browser = await puppeteer.launch(opts);
  let page = await browser.newPage();

  // request some work
  await sock.send(topic);
  console.log(`${topic} ready to do some etherpadding`);

  const msg = await sock.receive();
  console.log(msg.toString());
  const command = JSON.parse(msg.toString());
  try {
    //await page.tracing.start({path: 'trace.json'});
    const start = new Date;
    await timeout(loadEtherpad(page, command.url), maxWait, 'load timeout');
    const loadTime = new Date() - start
    //await page.tracing.stop();
    console.log(`It took ${loadTime}ms to load Etherpad`);
    let characterCount = await babble(page);
    console.log(`Finished sending ${characterCount} characters to etherpad`);
    await timeout( 
      reSock.send(JSON.stringify({
        loadTime,
        characterCount,
        worker: topic.toString(),
      })),
      maxWait,
      'reply timeout');
  } catch (e) {
    console.log('An error occurred', e.toString());
    await reSock.send(JSON.stringify({
      worker: topic.toString(),
      error: e.toString(),
    }))
  } 
  await sock.close();
  await reSock.close();
  await browser.close();
};

(async () => {
  try {
    let ccHost = `tcp://${argv['cc-address']}`
    await runClient(ccHost);
  } catch (e) {
    console.log(e);
  }
  // Force quite, something keeps the script up :(
  // I'm very suspicion of the last reply we send to the server
  process.exit(1);
})();
