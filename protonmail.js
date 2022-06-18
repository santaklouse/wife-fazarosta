import puppeteer from 'puppeteer';

// TODO: move to .env
const USER_LOGIN = 'redacted';
const USER_PASS = 'redacted';


const BROWSER_SCREEN_WIDTH = 1024;
const BROWSER_SCREEN_HEIGHT = 1600;


const PUPPETEER_OPTIONS = {
    'defaultViewport': { 'width': BROWSER_SCREEN_WIDTH, 'height': BROWSER_SCREEN_HEIGHT },
    headless: false,
    userDataDir: './.chromeDataDir',
    devtools: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
    ]
};

const browser = await puppeteer.launch(PUPPETEER_OPTIONS);

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.0.0 Safari/537.36';

const LOGIN_URL = 'https://account.proton.me/login';

(async() => {
    const newPage = async browser => {

        const page = await browser.newPage();

        page.setDefaultNavigationTimeout(90000);

        await page.setUserAgent(USER_AGENT);

        await page.addStyleTag({ content: "{scroll-behavior: auto !important;}" });

        await page.setViewport({ 'width': BROWSER_SCREEN_WIDTH, 'height': BROWSER_SCREEN_HEIGHT });


        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        return page;
    };

    const page = await newPage(browser);

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    const promise = new Promise(async (resolve, reject) => {
        await page.once('load', async() => {
            console.info('Page loaded', page.url());
            resolve();
        });
    });

    await promise;

    await page.waitForTimeout(2000);

    let isLoginNeeded = false;
    try {
        isLoginNeeded = await page.waitForSelector('#username', {timeout: 10000});
    } catch (e) {
        isLoginNeeded = false;
    }

    await page.waitForTimeout(2000);

    if (isLoginNeeded) {
        console.log('type use creds');
        await page.type('#username', USER_LOGIN);
        await page.type('#password', USER_PASS);

        await page.click('[type="submit"]');
        console.log('submit and wait');
        await page.waitForNavigation();

        console.log('New Page URL:', page.url());
    } else {
        console.log('login not needed');
    }

    await page.waitForTimeout(5000);

    await page.waitForSelector('.main');


    const ids = await page.evaluate(() => Array.from(document.querySelectorAll('.main-area--with-toolbar .items-column-list-inner .item-container'), element => element.dataset.elementId));

    for (const emailId of ids) {
        console.log(`email id: ${emailId}`);

        const $listItem = await page.$(`.main .items-column-list [data-element-id='${emailId}']`);

        const emailListData = await $listItem.evaluate(listItem => {
            console.log(listItem)
            const from = listItem.querySelector('[data-testid="message-column:sender-address"]');
            const title = listItem.querySelector('[data-testid="message-column:subject"]');
            const date = listItem.querySelector('[data-testid="item-date"]');
            return {
                from: {
                    email: from.title,
                    title: from.textContent,
                },
                title: title.textContent,
                date: date.textContent
            };
        });


        console.log(`processing ${emailListData.title} | from: ${emailListData.from.title} (${emailListData.from.email}) at ${emailListData.date}`)
        console.log('click on item');
        await $listItem.evaluate((e) => e.click());
        await page.waitForTimeout(2000);
        console.log('wait for updated container');
        await page.waitForSelector('article.message-container');
        await page.waitForTimeout(1000);

        const viewContainer = await page.$("main .view-column-detail .message-container");



        console.log('getting from')
        const from = await viewContainer.evaluate(node => node.querySelector('.message-recipient-item-address').textContent)
        console.log('getting to')
        const to = await viewContainer.evaluate(node => node.querySelector('.message-recipient-item-label').textContent)
        console.log('getting title')

        const $header = await page.$('section.view-column-detail > header');
        const title = await $header.evaluate((header) => header.querySelector('.message-conversation-summary-header').textContent)


        /*
        //TODO: add detecting new emails and forwarding to gmail
         */
        console.log(`
        From: ${from}
        To: ${to}
        Title: ${title}
        `)
    }

    await browser.close();
})();