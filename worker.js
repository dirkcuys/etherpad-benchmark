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

  await page.goto(url, {timeout: 0, waitUntil: 'networkidle0'});
  frame = await aceInner;
  await frame.waitForSelector('div');
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
  const sock = new zmq.Subscriber;
  sock.connect(`${ccHost}:3001`);
  sock.subscribe(topic);
  console.log("Subscribe socket connected");

  // socket for coordination
  const ccSock = new zmq.Push;
  await ccSock.connect(`${ccHost}:3000`);
  console.log("CC link established");

  const reSock = new zmq.Push;
  await reSock.connect(`${ccHost}:3002`);

  // start up headless chrome
  const opts = {
    timeout: 10000,
    //headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  let browser = await puppeteer.launch(opts);
  let page = await browser.newPage();

  await ccSock.send(topic);
  console.log(`${topic} ready to do some etherpadding`);

  await new Promise(async (resolve, reject) => {
    try {
      for await (const [topic, msg] of sock) {
        console.log(msg.toString());
        const command = JSON.parse(msg.toString());
        if (command.url){
          try {
            //await page.tracing.start({path: 'trace.json'});
            const start = new Date;
            await Promise.race([
              loadEtherpad(page, command.url),
              new Promise((resolve, reject) => setTimeout(reject, 30000)),
            ]);
            const loadTime = new Date() - start
            //await page.tracing.stop();
            console.log(`It took ${loadTime}ms to load Etherpad`);
            let characterCount = await babble(page);
            // Maybe add a max time here
            console.log(`Finished sending ${characterCount} characters to etherpad`);
            await reSock.send(JSON.stringify({
              loadTime,
              characterCount,
              worker: topic.toString(),
            }));
          } catch (e) {
            await reSock.send(JSON.stringify({
              worker: topic.toString(),
              error: e.toString(),
            }));
          }
          await sock.close();
          await reSock.close();
          resolve();
          break;
        } else {
          console.log('Unknown command');
        }
      }
    } catch (e) {
      reject(e);
    }
  });

  await browser.close();
};

(async () => {
  try {
    let ccHost = `tcp://${argv['cc-address']}`
    await runClient(ccHost);
  } catch (e) {
    console.log(e);
  }
})();
