import fs from 'fs';
import path from 'path';
import { promisify, promisifyAll } from 'bluebird';
import { createServer } from 'http';
import { Server } from 'node-static';
import co from 'co';
import prompt from 'co-prompt';
import { ncp } from 'ncp';
import open from 'open';
import { load as npmLoad } from 'npm';
import dd from 'dedent';
import { rootdir, postspath, pagespath } from '../config';
import { cliColor, getConfig, titleToFilename } from '../helpers';
promisifyAll(fs);
const npmLoadAsync = promisify(npmLoad);
const ncpAsync = promisify(ncp);

export { init, config, newFile, run, openFile };

// Open a file using browser, text-editor
function openFile(type, sitePath, file) {
    if (type === 'file') {
        open(path.resolve(sitePath, file));
    } else {
        open(file);
    }
}

async function init(sitePath) {
    const skeletonPath = path.join(rootdir, 'bin/skeleton');
    const clc = cliColor();

    // `fs.exists` doesn't follow the Node.js callback convention, it needs to be promisified manually.
    const exists = await new Promise((fulfill) => fs.exists(sitePath, fulfill));
    if (!exists) {
        await fs.mkdirAsync(sitePath);
    }

    await ncpAsync(skeletonPath, sitePath);
    console.log(clc.message('Harmonic skeleton started at: ' + path.resolve(sitePath)));

    await config(sitePath);

    console.log(clc.info('\nInstalling dependencies...'));
    const npm = await npmLoadAsync();
    try {
        await promisify(npm.commands.install)(sitePath, []);
    } catch (e) {
        console.error(dd
            `Command ${clc.error('npm install')} failed.
             Make sure you are connected to the internet and execute the command above in your Harmonic skeleton directory.`
        );
    }

    console.log('\n' + clc.info(dd
        `Your Harmonic website skeleton was successfully created!
         Now, browse the project directory and have fun.`
    ));
}

function config(sitePath) {
    const clc = cliColor();
    const manifest = path.join(sitePath, 'harmonic.json');

    return new Promise((fulfill, reject) => {
        co(function*() {
            console.log(clc.message(
                'This guide will help you to create your Harmonic configuration file\n' +
                'Just hit enter if you are ok with the default values.\n\n'
            ));

            const templateObj = {
                name: 'Awesome website',
                title: 'My awesome static website',
                domain: 'http://awesome.com',
                subtitle: 'Powered by Harmonic',
                author: 'Jaydson',
                description: 'This is the description',
                bio: 'Thats me',
                theme: 'harmonic-theme-default',
                preprocessor: 'stylus',
                posts_permalink: ':language/:year/:month/:title',
                pages_permalink: 'pages/:title',
                header_tokens: ['<!--', '-->'],
                index_posts: 10,
                i18n: {
                    default: 'en',
                    languages: ['en', 'pt-br']
                }
            };

            function _p(message) {
                return prompt(clc.message(message));
            }

            const config = {
                name: (yield _p('Site name: (' + templateObj.name + ') ')) ||
                    templateObj.name,
                title: (yield _p('Title: (' + templateObj.title + ') ')) ||
                    templateObj.title,
                subtitle: (yield _p('Subtitle: (' + templateObj.subtitle + ') ')) ||
                    templateObj.subtitle,
                description: (yield _p('Description: (' + templateObj.description + ') ')) ||
                    templateObj.description,
                author: (yield _p('Author: (' + templateObj.author + ') ')) ||
                    templateObj.author,
                bio: (yield _p('Author bio: (' + templateObj.bio + ') ')) ||
                    templateObj.bio,
                theme: (yield _p('Theme: (' + templateObj.theme + ') ')) ||
                    templateObj.theme,
                preprocessor: (yield _p('Preprocessor: (' + templateObj.preprocessor + ') ')) ||
                    templateObj.preprocessor
            };

            process.stdin.pause();

            // create the configuration file
            fs.writeFile(manifest, JSON.stringify(Object.assign({}, templateObj, config), null, 4), (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                fulfill();
            });
        })();
    });
}

/**
 * @param {string} type - The new file's type. Can be either 'post' or 'page'.
 * @param {string} title - The new file's title.
 */
function newFile(sitePath, type, title, autoOpen) {
    var clc = cliColor(),
        langs = getConfig(sitePath).i18n.languages,
        template = '<!--\n' +
            'layout: ' + type + '\n' +
            'title: ' + title + '\n' +
            'date: ' + new Date().toJSON() + '\n' +
            'comments: true\n' +
            'published: true\n' +
            'keywords:\n' +
            'description:\n' +
            'categories:\n' +
            '-->\n' +
            '# ' + title,
        filedir = path.join(sitePath, type === 'post' ? postspath : pagespath),
        filename = titleToFilename(title);

    langs.forEach((lang) => {
        let fileLangDir = path.join(filedir, lang);
        let fileW = path.join(fileLangDir, filename);
        if (!fs.existsSync(fileLangDir)) {
            fs.mkdirSync(fileLangDir);
        }
        fs.writeFileSync(fileW, template);
        if (autoOpen) {
            openFile('text', sitePath, fileW);
        }
    });

    console.log(clc.info(
        type[0].toUpperCase() + type.slice(1) +
        ' "' + title + '" was successefuly created, check your /src/' + type + 's folder'
    ));
}

function run(sitePath, port, autoOpen) {
    let clc = cliColor();
    let file = new Server(path.join(sitePath, 'public'));

    console.log(clc.info('Harmonic site is running on http://localhost:' + port));
    if (autoOpen) {
        openFile('uri', sitePath, 'http://localhost:' + port);
    }
    // Create the server
    createServer((request, response) => {
        request.addListener('end', function() {
            file.serve(request, response, (err) => {
                if (err) {
                    console.log(clc.error(
                        'Error serving ' + request.url + ' - ' + err.message
                    ));
                    response.writeHead(err.status, err.headers);
                    response.end();
                }
            });
        }).resume();
    }).listen(port);
}
