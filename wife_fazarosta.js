#!/usr/bin/env node

/*
system requirements:
 libxkbcommon-dev
 libatk-bridge2.0-dev
 libnss3-dev
 libgbm-dev
 libgtk-3-dev
 libasound-dev
*/
import { appendFile, access, readFile, mkdir, copyFile } from "fs/promises";
import { constants, existsSync, openSync, writeFileSync } from 'fs';
import { spawn, execSync } from 'child_process';
import fetch from 'node-fetch';
import path from 'path';
import puppeteer from 'puppeteer';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Tail } from 'tail';
import FastGlob from 'fast-glob';


async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

const argv = yargs(hideBin(process.argv))
    .option('first-start', {
        alias: 'f',
        description: 'first start with opening browser for login and save session',
        type: 'boolean',
    })
    .option('download-videos', {
        alias: 'd',
        description: 'just download videos',
        type: 'boolean',
    })
    .option('kill-background', {
        alias: 'k',
        description: 'kill background downloaders',
        type: 'boolean',
    })
    .option('show-progress', {
        alias: 's',
        description: 'Show logs of video downloader',
        type: 'boolean',
    })
    .option('background-download', {
        alias: 'b',
        description: 'start download in background',
        type: 'boolean',
    })
    .option('background-pids', {
        alias: 'p',
        description: 'show pids of background download jobs',
        type: 'boolean',
    })
    .help()
    .alias('help', 'h')
    .alias('version', 'v')
    .argv;

const BROWSER_SCREEN_WIDTH = 1024;
const BROWSER_SCREEN_HEIGHT = 1600;

const PUPPETEER_OPTIONS = {
    'defaultViewport': { 'width': BROWSER_SCREEN_WIDTH, 'height': BROWSER_SCREEN_HEIGHT },
    // headless: false,
    userDataDir: './.chromeDataDir',
    // devtools: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
    ]
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36';

const OUT_DIR = './out/';

const COURSE_JSON_FILE_NAME = 'courseApiResponse.json';
const COURSE_JSON_FILE_PATH = path.join(OUT_DIR, COURSE_JSON_FILE_NAME);

const BASE_URL = 'https://lms.fazarosta.com';

const COURSES_PAGE_URL = `${BASE_URL}/office/courses/483`;
// const LOGIN = 'allexandra@ukr.net';
// const PASS = '2123973';

const COURSE_ID = 483;

const lessonPageUrl = lessonId => `${COURSES_PAGE_URL}/lesson/${lessonId}`;
const courseApiUrl = courseId => `${BASE_URL}/api/courses/${courseId}`;
const lessonApiUrl = (courseId, lessonId) => `${BASE_URL}/api/courses/${courseId}/lessons/${lessonId}`;

const API_REQ_HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "ru,en;q=0.9,en-US;q=0.8,uk;q=0.7,de;q=0.6,ru-RU;q=0.5",
    "authorization": "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjU2Mjk4LCJpc3MiOiJodHRwczovL2xtcy5mYXphcm9zdGEuY29tL2FwaS9sb2dpbiIsImlhdCI6MTYyMzA3MjYxMywiZXhwIjoxNjI0MzMyNjEzLCJuYmYiOjE2MjMwNzI2MTMsImp0aSI6IjB1VXE4blUyeDYzQVhhOXcifQ.y0fJDuXfh0w5YrGhXqm0zeNswAEsr-vAvaCoJ6UVJn0",
    "cache-control": "no-cache",
    "content-type": "application/json",
    "pragma": "no-cache",
    "sec-ch-ua": "\" Not;A Brand\";v=\"99\", \"Google Chrome\";v=\"91\", \"Chromium\";v=\"91\"",
    "sec-ch-ua-mobile": "?0",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin"
};

const doAjax = async apiUrl => {
    console.log(`ajax call to ${apiUrl}`);
    const response = await fetch(apiUrl, {
        "headers": API_REQ_HEADERS,
        "referrer": "https://lms.fazarosta.com/office",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": null,
        "method": "GET",
        "mode": "cors",
        "credentials": "include"
    });

    if (response.ok) {
        const jsonValue = await response.json(); // Get JSON value from the response body
        return Promise.resolve(jsonValue);
    } else {
        return Promise.reject('***error');
    }
};

const isFileExists = async filePath => {
    try {
        await access(filePath, constants.F_OK | constants.R_OK);
        return Promise.resolve(true);
    } catch {
        return Promise.resolve(false);
    }
};

const downloadVideoFile = async (videoUrl, lessonId, dir) => {
    const VIDEO_OUT_DIR = path.resolve(dir);

    const SPAWN_OPTIONS = {
        // stdio: ['ignore', out, err], // piping stdout and stderr to out.log
        // detached: true,
        cwd: VIDEO_OUT_DIR
    };

    const
        out = openSync(path.join(VIDEO_OUT_DIR, `out-${lessonId}.log`), 'w'),
        err = openSync(path.join(VIDEO_OUT_DIR, `err-${lessonId}.log`), 'w');

    if (argv.backgroundDownload) {
        // stdio: ['ignore', out, err], // piping stdout and stderr to out.log
        SPAWN_OPTIONS.stdio = ['ignore', out, err];
        //detach process
        SPAWN_OPTIONS.detached = true;
    }

    const params = [
        '--xattrs',
        '--geo-bypass',
        '--add-metadata',
        '--no-color',
        '--no-call-home',
        '--prefer-free-formats',
        '-f bestvideo[height<=?720]+bestaudio',
        `--referer='${lessonPageUrl(lessonId)}'`,
        `-o %(title)s.%(ext)s`,
        videoUrl
    ];

    console.log(`downloading: ${videoUrl}`);
    const subprocess = spawn('youtube-dl', params, SPAWN_OPTIONS);

    console.log(`Lesson #${lessonId}: 'youtubedl' subprocess started with PID: ${subprocess.pid}`);

    if (argv.backgroundDownload) {
        subprocess.unref();
        return Promise.resolve();
    }

    subprocess.stdout.pipe(process.stdout);
    subprocess.stderr.pipe(process.stderr);

    await new Promise( (resolve, reject) => {
        subprocess.on('close', function(code) {
            console.log(`${lessonId}: child process #${subprocess.pid} closed with code ${code}`);
            resolve({event: 'close', data: code});
        });
        subprocess.on('exit', (code) => {
            console.log(`${lessonId}: child process #${subprocess.pid} exited with code ${code}`);
            resolve({event: 'exit', data: code});
        });
        subprocess.on('error', (error) => {
            console.log(`${lessonId}: child process #${subprocess.pid} error occurred ${error}`);
            resolve({event: 'error', data: error});
        });
    });

    /*
    const subprocess = youtubedl.raw(videoUrl, {
        dumpSingleJson: true,
        noWarnings: true,
        noCallHome: true,
        noCheckCertificate: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true,
        referer: lessonPageUrl(lessonId),
        xattrs: true,
        addMetadata: true,
        o: `${videoOutDir}/%(title)s.%(ext)s`
        // restrictFilenames: true
    });
    */
    // subprocess.stdout.pipe(createWriteStream(path.join(videoOutDir, `out-${lessonId}.log`)));
    // subprocess.stderr.pipe(createWriteStream(path.join(videoOutDir, `err-${lessonId}.log`)));
};

const backgroundPids = () =>
    execSync("ps aux |grep youtube-dl|grep -v grep|awk '{print $2}'")
        .toString()
        .split("\n")
        .filter(s => !!s);

const killBackground = () => {
    const pids = backgroundPids();
    if (!pids.length) {
        console.log(`No started jobs found. Exiting...`);
        return;
    }
    console.log(`Found ${pids.join()} PIDS. Killing...`);
    spawn('kill', pids, {
        stdio: ['ignore'], // piping stdout and stderr to out.log
        detached: true
    }).unref();
};

const showProgress = () => {
    const entries = FastGlob.sync([`${OUT_DIR}**/**/*.log`]);

    entries.forEach(fileName => {
        const tail = new Tail(fileName);

        tail.on("line", function(data) {
            console.log(data);
        });
    });
};

const downloadVideos = async (courseDir) => {
    let linksPath = path.resolve(courseDir, 'all_video_links.json');
    let allVideoFileLinks = [];
    if (await isFileExists(linksPath)) {
        // read content
        allVideoFileLinks = JSON.parse(await readFile(linksPath));
    } else {
        throw 'Links file does not exists.';
    }
    console.log(`start downloading ${Object.keys(allVideoFileLinks).length} in background`);
    await asyncForEach(allVideoFileLinks, async (obj) => {
        await downloadVideoFile(obj.link, obj.lessonId, obj.dir);
    });
    console.info("...you can see downloading progress by using '-s' flag");
};

if (argv.firstStart) {
    PUPPETEER_OPTIONS.headless = false;
}

// the Main function
(async() => {

    // for '-p' parameter
    if (argv.backgroundPids) {
        return console.log(backgroundPids().join(' '));
    }

    // for '-k' parameter
    if (argv.killBackground) {
        return killBackground();
    }

    // for '-s' parameter
    if (argv.showProgress) {
        return showProgress();
    }

    if (!existsSync(OUT_DIR))
        await mkdir(OUT_DIR);

    let courseJson = {};

    // Check if the file exists in the current directory.
    const courseFileExists = await isFileExists(COURSE_JSON_FILE_PATH);

    if (courseFileExists) {
        // read content
        courseJson = JSON.parse(await readFile(COURSE_JSON_FILE_PATH));
    } else {
        // fill file
        courseJson = await doAjax(courseApiUrl(COURSE_ID));
        await appendFile(COURSE_JSON_FILE_PATH, JSON.stringify(courseJson));
    }

    let lessons = courseJson.lessons;

    const COURSE_DIR = path.join(OUT_DIR, courseJson.name);

    if (!existsSync(COURSE_DIR))
        await mkdir(COURSE_DIR);

    const newJsonFilePath = path.join(COURSE_DIR, COURSE_JSON_FILE_NAME);
    if (!(await isFileExists(newJsonFilePath))) {
        await copyFile(COURSE_JSON_FILE_PATH, newJsonFilePath);
    }

    // for '-d' parameter
    if (argv.downloadVideos) {
        return await downloadVideos(COURSE_DIR);
    }

    let allVideoFileLinks = [];

    const browser = await puppeteer.launch(PUPPETEER_OPTIONS);

    let currentLessonId = 0;

    const newPage = async browser => {
        const page = await browser.newPage();

        page.setDefaultNavigationTimeout(0);

        await page.setViewport({ 'width': BROWSER_SCREEN_WIDTH, 'height': BROWSER_SCREEN_HEIGHT });

        await page.setUserAgent(USER_AGENT);

        await page.addStyleTag({ content: "{scroll-behavior: auto !important;}" });

        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        page.once('load', async() => {
            console.info('Page loaded', page.url());
        });

        return page;
    };

    if (argv.firstStart) {
        const page = await newPage(browser);
        await page.goto(BASE_URL);
        return;
    }

    const processLesson = async lesson => {
        currentLessonId = lesson.id;

        const LESSON_DIR = path.join(COURSE_DIR, lesson.id + '_' + lesson.name.replace('/', '_') + (lesson.tag ? ' - ' + lesson.tag : ''));
        if (!existsSync(LESSON_DIR))
            await mkdir(LESSON_DIR);

        const LESSON_JSON_FILE_PATH = path.join(LESSON_DIR, 'api_response.json');
        const lessonJsonFileExists = await isFileExists(LESSON_JSON_FILE_PATH);

        if (lessonJsonFileExists) {
            // read content
            lesson.json = JSON.parse(await readFile(LESSON_JSON_FILE_PATH));
        } else {
            // fill file
            lesson.json = await doAjax(lessonApiUrl(COURSE_ID, lesson.id));
            await appendFile(LESSON_JSON_FILE_PATH, JSON.stringify(lesson.json));
        }

        const page = await newPage(browser);
        console.log(`Lesson #${lesson.id} page spawned`);
        await page.goto(lessonPageUrl(lesson.id), {
            waitUntil: 'load',
            timeout: 0
        });

        // wait for 2 seconds
        await page.waitForTimeout(2000);

        // Wait for the results page to load and display the results.
        const videoContainerSelector = 'iframe';
        await page.waitForSelector(videoContainerSelector);

        // Extract the results from the page.
        let links = await page.evaluate((resultsSelector) => {
            const anchors = Array.from(document.querySelectorAll(resultsSelector));
            return anchors.map((anchor) => {
                if (anchor.src.includes('vimeo') || anchor.src.includes('player') || anchor.src.includes('youtube'))
                    return anchor.src;
            });
        }, videoContainerSelector);

        await page.screenshot({path: path.join(LESSON_DIR, `screenshot-${lesson.id}.png`), fullPage: true});
        await page.pdf({path: path.join(LESSON_DIR, `page-${lesson.id}.pdf`), format: 'A4'});

        const content = await page.content();

        //save page content
        writeFileSync(path.resolve(LESSON_DIR, 'page_content.html'), content.toString());

        links = links.filter(a => !!a);

        if (!links.length) {
            console.log(`Lesson #${lesson.id} page closed`);
            return await page.close();
        }

        let listOfLinks = links.join("\n");

        writeFileSync(path.resolve(LESSON_DIR, 'links.json'), listOfLinks);
        console.log(`Lesson #${lesson.id} links (${links.length}) saved to: ${path.resolve(LESSON_DIR, 'links.json')}`);
        links.forEach(link => {
            allVideoFileLinks.push({
                link: link,
                lessonId: lesson.id,
                dir: LESSON_DIR
            });
        });

        await page.close();
        console.log(`Lesson #${lesson.id} page closed`);
    };



    const start = async (lessons) => {
        let total = lessons.length;
        await asyncForEach(lessons, async (lesson) => {
            await processLesson(lesson);
            console.log(`lesson #${lesson.id} done. ${--total} left`);
        });
        console.log(`start downloading ${Object.keys(allVideoFileLinks).length} in background`);
        // start downloading in background
        console.log(allVideoFileLinks);

        writeFileSync(path.resolve(COURSE_DIR, 'all_video_links.json'), JSON.stringify(allVideoFileLinks));

        await downloadVideos(COURSE_DIR);

        console.log('Done.');
    };
    await start(lessons);

    await browser.close();

})();
