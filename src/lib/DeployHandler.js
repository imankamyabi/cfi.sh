const chalk = require('chalk');
const fs = require('fs-extra');
const _ = require('underscore');
const sleep = require('sleep');
const figures = require('figures');
const AWS = require('aws-sdk');

module.exports.execute = (options) => {
    AWS.config.update({region: options.region});
    const cfClient = new AWS.CloudFormation({apiVersion: '2010-05-15'});
    return cfClient.describeStacks({
        StackName: options.name
    }).promise().then((result) => {
        console.log("Stack already exists, updating stack ...");
        // TO BE IMPLEMENTED.
    }).catch((error) => {
        if (error.statusCode == 400) {
            fs.readFile(options.path, "utf8").then((result) => {
                return cfClient.createStack({
                    StackName: options.name,
                    TemplateBody: result
                }).promise().then((result) => {
                    console.log(chalk.green('Initiated stack creation ...'));
                    const stackEvents = [];
                    const printedStatus = {};
                    return getStackEvents(stackEvents, options.name, printedStatus);
                });
            })
        }
    });
}

const getStackEvents = function(stackEvents, stackName, printedStatus) {
    const cfClient = new AWS.CloudFormation({apiVersion: '2010-05-15'});
    return cfClient.describeStackEvents({
        StackName: stackName
    }).promise().then((result) => {
        let updatedStackEvents = _.uniq(_.union(stackEvents, result.StackEvents), false, function(item, key, EventId){ return item.EventId;});
        updatedStackEvents = _.sortBy(updatedStackEvents,"Timestamp");
        printedStatus = printNewEvents(updatedStackEvents, printedStatus);

        if (!isDone(updatedStackEvents, stackName)) {
            sleep.sleep(1);
            return getStackEvents(updatedStackEvents, stackName, printedStatus)
        } else {
            printNewEvents(updatedStackEvents, printedStatus);
            console.log(chalk.green('Stack created succesfully.'));
        }
    });
}

const isDone = function(stackEvents, stackName) {
    
    const filtered = stackEvents.filter((eventItem) => {
        if ((eventItem.LogicalResourceId === stackName) && (eventItem.ResourceStatus === "CREATE_COMPLETE")) {
            return true
        } else {
            return false;
        }
    });

    if (filtered.length > 0) {
        return true;
    } else {
        return false;
    }
}

const printNewEvents = function(updatedStackEvents, printedStatus) {
    var offset = 360;
    updatedStackEvents.forEach(item => {
        if (printedStatus && !printedStatus[item.EventId]) {
            if (item.ResourceStatus === 'CREATE_IN_PROGRESS') {
                console.log(chalk.white(normalizeLength(formatTime(isoDateToLocalDate(item.Timestamp, offset)), 15))  + chalk.cyan(normalizeLength(item.LogicalResourceId, 20)) + chalk.yellow(normalizeLength(item.ResourceStatus, 25)) + chalk.yellow(figures.ellipsis));
            } else if (item.ResourceStatus === 'CREATE_COMPLETE') {
                console.log(chalk.white(normalizeLength(formatTime(isoDateToLocalDate(item.Timestamp, offset)), 15))  + chalk.cyan(normalizeLength(item.LogicalResourceId, 20)) + chalk.green(normalizeLength(item.ResourceStatus, 25)) + chalk.green(figures.tick));
            }
            printedStatus[item.EventId] = true;
        }
    });
    return printedStatus;
}

const isoDateToLocalDate = function(ISOTimeString, offsetInMinutes) {
    var newTime = new Date(ISOTimeString);
    return new Date(newTime.getTime() - (offsetInMinutes * 60000));
}

const formatTime = function(localIsoDate) {
    function z(n){return (n<10?'0':'')+n};
    const hh = localIsoDate.getUTCHours();
    const mm = localIsoDate.getUTCMinutes();
    const ss = localIsoDate.getUTCSeconds();
    return z(hh)+':'+z(mm)+':'+z(ss);
}

const normalizeLength = function(input, length) {
    if (input.length < length) {
        const spaceNum = length - input.length;
        for (i = 0; i < spaceNum; i++) { 
            input += ' ';
        }
    }
    return input;
}