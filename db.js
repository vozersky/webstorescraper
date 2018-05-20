const fs = require('fs');
const zipper = require("zip-local");


// node-postgres uses the same environment variables as libpq to connect to a PostgreSQL server.
const { Client } = require('pg');
const insertMetaSql = "INSERT INTO extensions.extensions (id, name, author, description, category, usersCount, rating, ratingsCount, analyticsId, website, inApp) "
    + " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);"
const insertFileSql = "INSERT INTO extensions.extensions_files (extension_id, file_path, file_content) VALUES ($1, $2, $3);";
const insertRequestSql = "INSERT INTO extensions.requests (extension_id, method, url, origin_url, type, request_body) VALUES ($1, $2, $3, $4, $5, $6);";

/**
 * Insert extension requests data to the requests table
 * 
 * @param {*} requestsPath requests path
 * @param {*} dbProperties  db properties
 */
let insertRequests = async function (requestsPath, dbProperties) {
    console.log("Inserting extension requests");

    if (!fs.existsSync(requestsPath)) {
        console.log("Requests file does not exist");
        return;
    }

    let requests = JSON.parse(fs.readFileSync(requestsPath));

    // Connecting to the database
    let client = new Client(dbProperties);
    try {
        await client.connect();

        for (let i = 0; i < requests.length; i++) {
            let extensionRequests = requests[i];

            for (let j = 0; j < extensionRequests.requests.length; j++) {
                let request = extensionRequests.requests[j];

                await client.query(insertRequestSql, [
                    extensionRequests.id,
                    request.method,
                    request.url,
                    request.originUrl,
                    request.type,
                    request.body
                ]);
            }
        }
    } catch (ex) {
        console.error(ex);
    } finally {
        await client.end();
    }
}

/**
 * Insert extension files content to the extensions_files table
 * 
 * @param {*} extension Extension meta data
 * @param {*} extensionsDirectory Extensions directory
 * @param {*} dbProperties  db properties
 */
let insertExtensionFiles = async function (extension, extensionsDirectory, dbProperties) {
    console.log("Inserting files of %s (%s)", extension.name, extension.id);

    let filePath = extensionsDirectory + "/" + extension.id + ".crx";
    if (!fs.existsSync(filePath)) {
        console.log("File does not exist");
        return;
    }

    // Connecting to the database
    let client = new Client(dbProperties);
    try {
        await client.connect();

        // export in memory 
        let unzippedfs = zipper.sync.unzip(filePath).memory();
        let files = unzippedfs.contents();

        for (let i = 0; i < files.length; i++) {
            let path = files[i];

            // Insert only text/js/json files contents
            if (!path.endsWith(".js") &&
                !path.endsWith(".json") &&
                !path.endsWith(".txt")) {
                continue;
            }

            var fileContents = unzippedfs.read(path, "buffer").toString();

            await client.query(insertFileSql, [
                extension.id,
                path,
                fileContents
            ]);
        }
    } catch (ex) {
        console.error(ex);
    } finally {
        await client.end();
    }
};

/**
 * Inserts extension data to the extensions table
 * 
 * @param {*} extension Extension meta data
 */
let insertExtensionData = async function (extension, dbProperties) {

    console.log("Inserting data of %s (%s)", extension.name, extension.id);

    // Connecting to the database
    let client = new Client(dbProperties);
    try {
        await client.connect();

        await client.query(insertMetaSql, [
            extension.id,
            extension.name,
            extension.author,
            extension.description,
            extension.category,
            extension.usersCount,
            extension.rating,
            extension.ratingsCount,
            extension.analyticsId,
            extension.website,
            extension.inApp
        ]);

    } catch (ex) {
        console.error(ex);
    } finally {
        await client.end();
    }
};

/**
 * Fills extensions tables with data (see data/db.sql)
 * 
 * @param {*} extensionsMetaFilePath Path to the file with extensions meta data
 * @param {*} extensionsDirectory Path to the directory with extensions CRX files
 * @param {*} requestsPath Extensions requests path
 * @param {*} dbProperties DB properties
 */
let fillExtensionsTables = async function (extensionsMetaFilePath, extensionsDirectory, requestsPath, dbProperties) {
    try {
        console.log("Filling extensions tables with data");
        let extensions = JSON.parse(fs.readFileSync(extensionsMetaFilePath));

        for (let i = 0; i < extensions.length; i++) {

            let extension = extensions[i];
            await insertExtensionData(extension, dbProperties);
            await insertExtensionFiles(extension, extensionsDirectory, dbProperties);
        }

        await insertRequests(requestsPath, dbProperties);
    } catch (ex) {
        console.log(ex);
    }
};

module.exports.fillExtensionsTables = fillExtensionsTables;