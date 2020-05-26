const puppeteer = require('puppeteer');
const zmq = require("zeromq");
const os = require('os');

async function runClient(){
  let topic = `worker-${os.hostname()}-${process.pid}`;
  let ccHost = 'tcp://127.0.0.1'
  const sock = new zmq.Subscriber
  sock.connect(`${ccHost}:3001`)
  sock.subscribe(topic)
  console.log("Subscribe socket connected")

  const ccSock = new zmq.Push
  await ccSock.connect(`${ccHost}:3000`)
  console.log("CC link established")

  const opts = {
    timeout: 10000,
    //headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };

  let browser = await puppeteer.launch(opts);
  let page = await browser.newPage();

  //page.on('request', req => console.log(`${req.method()}: ${req.url()}`));
  page.on('load', event => console.log('page loaded'));

  let theCarrot = new Promise((resolve, reject) => {
    page.on('requestfinished', request => {
      if (request.url().search(/caretPosition.js/) >= 0){
        console.log('Whats up doc');
        resolve();
      }
    });
  });


  // wait for ace-inner iframe
  let aceInner = new Promise((resolve, reject) => {
    page.on('frameattached', frame => {
      console.log(frame.name());
      if (frame.parentFrame() && frame.parentFrame().name() == 'ace_outer'){
        resolve(frame);
        console.log('ace_inner attached');
      } else if (frame.parentFrame()){
        console.log(frame.parentFrame().name());
      }
    });
  });

  let pageUrl = `https://unhangpad.code27.co.za/p/testpad`;
  console.log(`Goto ${pageUrl}`);
  //await page.tracing.start({path: 'trace.json'});
  page.goto(pageUrl, {timeout: 0, waitUntil: 'networkidle0'});
  //page.goto(pageUrl);
  //await page.tracing.stop();
  
  frame = await aceInner;
  //const frame = page.frames().find(frame => frame.name() === 'ace_inner');
  await frame.waitForSelector('.ace-line');
  console.log("ace-lines");
  //await theCarrot;
  await new Promise((res, rej) => setTimeout(res, 2000));

  await ccSock.send(topic);
  console.log(`${topic} ready to do some etherpadding`);

  await new Promise(async (resolve, reject) =>{
    try {
      for await (const [topic, msg] of sock) {
        if (msg.toString() == 'done'){
          console.log('My work is done here!');
          await sock.close();
          resolve();
        } else {
          console.log("happily typing: %s", msg.toString());
          await page.keyboard.type(msg.toString(), {delay: 20});
        }
      }
    } catch (e) {
      reject(e);
    }
  });

  await new Promise((res, rej) => setTimeout(res, 10000));

  //dumpFrameTree(page.mainFrame(), '');
  function dumpFrameTree(frame, indent) {
    console.log(indent + frame.url());
    for (let child of frame.childFrames())
      dumpFrameTree(child, indent + '  ');
  }

  await browser.close();
};

(async () => {
  try {
    await runClient();
  } catch (e) {
    // Deal with the fact the chain failed
    console.log(e);
  }
})();
