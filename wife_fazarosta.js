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
import { appendFile, access, readFile, mkdir } from "fs/promises";
import { constants, existsSync, openSync } from 'fs';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import path from 'path';
// import pkg2 from 'puppeteer';
import puppeteer from 'puppeteer';

const width = 1024;
const height = 1600;


const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36';

const COURSES_JSON_FILE_PATH = './courseApiResponse.json';
const OUT_DIR = './out/';

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

(async() => {
    let courseJson = {};

    // Check if the file exists in the current directory.
    const courseFileExists = await isFileExists(COURSES_JSON_FILE_PATH);

    if (courseFileExists) {
        // read content
        courseJson = JSON.parse(await readFile(COURSES_JSON_FILE_PATH));
    } else {
        // fill file
        courseJson = await doAjax(courseApiUrl(COURSE_ID));
        await appendFile(COURSES_JSON_FILE_PATH, JSON.stringify(courseJson));
    }


    let lessons = courseJson.lessons;


    const COURSE_DIR = path.join(OUT_DIR, courseJson.name);

    if (!existsSync(COURSE_DIR))
        await mkdir(COURSE_DIR);


    // foreach lessons:
    //  1) create dir
    //  2) call lesson api
    //  3) open page:
    //      a) make and save screenshot
    //      b) save html page
    //      c) find lesson video url address and download it by youtube-dl



    const browser = await puppeteer.launch({
        'defaultViewport': { 'width': width, 'height': height },
        // headless: false,
        userDataDir: './.chromeDataDir',
        // devtools: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ]
    });

    let currentLessonId = 0;

    const newPage = async browser => {
        const page = await browser.newPage();

        page.setDefaultNavigationTimeout(900000);


        await page.setViewport({ 'width': width, 'height': height });

        await page.setUserAgent(USER_AGENT);

        await page.addStyleTag({ content: "{scroll-behavior: auto !important;}" });

        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        page.once('load', async() => {
            console.log('Page loaded!', page.url());
            // await page.screenshot({ path: `test/example-${currentLessonId}.png`, fullPage: true });
        });

        return page;
    };

    await Promise.all(lessons.map(async lesson => {
        currentLessonId = lesson.id;

        const LESSON_DIR = path.join(COURSE_DIR, lesson.name.replace('/', '_') + (lesson.tag ? ' - ' + lesson.tag : ''));
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
        console.log(`Lesson ${lesson.id} page Spawned`);
        await page.goto(lessonPageUrl(lesson.id), { waitUntil: 'domcontentloaded' });

        // wait for 1 second
        await page.waitFor(2000);

        await page.evaluate(() => console.log(`url is ${location.href}`));

        // wait for 1 second
        await page.waitFor(2000);

        // Wait for the results page to load and display the results.
        const videoContainerSelector = 'iframe';
        await page.waitForSelector(videoContainerSelector);

        // const searchValue = await page.$eval('#search_form_input_homepage', el => el.value)

        // Extract the results from the page.
        let links = await page.evaluate((resultsSelector) => {
            const anchors = Array.from(document.querySelectorAll(resultsSelector));
            return anchors.map((anchor) => {
                if (anchor.src.includes('vimeo'))
                    return anchor.src;
            });
        }, videoContainerSelector);

        await page.screenshot({path: path.join(LESSON_DIR, `screenshot-${lesson.id}.png`), fullPage: true});
        await page.pdf({path: path.join(LESSON_DIR, `page-${lesson.id}.pdf`), format: 'A4'});

        links = links.filter(a => !!a);

        if (!links.length)
            return await page.close();

        console.log(lesson.id, links);

        // start downloading in background
        let
            out = openSync(path.join(LESSON_DIR, `out-${lesson.id}.log`), 'a'),
            err = openSync(path.join(LESSON_DIR, `err-${lesson.id}.log`), 'a');

        spawn('youtube-dl', ['--xattrs', '--add-metadata', '--no-progress', '--restrict-filenames', '--no-color', '--print-json', ...links], {
            stdio: ['ignore', out, err], // piping stdout and stderr to out.log
            detached: true
        }).unref();


    }));

    await browser.close();

})();
