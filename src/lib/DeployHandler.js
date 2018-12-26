const chalk = require('chalk');
const fs = require('fs-extra');
const yaml = require('js-yaml');
const ProgressBar = require('progress');
const _ = require('underscore');
const AWS = require('aws-sdk');

let deployStartTime;
let totalNum;
let inProgressResources = [];
let doneResources = [];
let stackFailedComplete = false;
const CF_REFRESH_RATE = 500;

module.exports.execute = (options) => {
    AWS.config.update({region: options.region});
    const cfClient = new AWS.CloudFormation({apiVersion: '2010-05-15'});
    stackName = options.name;
    return cfClient.describeStacks({
        StackName: options.name
    }).promise().then((result) => {
        console.log("Stack already exists, updating stack ...");
        // TO BE IMPLEMENTED.
    }).catch((error) => {
        if (error.statusCode == 400) {
            let templateObj;
            fs.readFile(options.path, "utf8").then((result) => {
                templateObj = yaml.load(result);
                totalNum = Object.keys(templateObj.Resources).length;
                deployStartTime = Date.now();
                return cfClient.createStack({
                    StackName: options.name,
                    Capabilities: [
                        "CAPABILITY_IAM"
                    ],
                    TemplateBody: result
                }).promise().then((result) => {
                    console.log('Initiated stack creation ...');
                    const stackEvents = [];
                    const printedStatus = {};
                    let bar = new ProgressBar('Deploying Stack [:bar] :percent   Resources: :total  :completedNum  :inProgressNum', {
                        complete: '=',
                        incomplete: ' ',
                        width: 20,
                        renderThrottle: 1,
                        total: totalNum
                    });
                    bar.tick(0, {
                        'completedNum': 'Completed: ' + 0,
                        'inProgressNum': 'In Progress: ' + 0
                    });
                    return getStackEvents(stackEvents, options.name, printedStatus, templateObj, bar);
                }).catch((error) => {
                    console.log(chalk.red(error.code + ': ' + error.message));
                });
            })
        }
    });
}

const getStackEvents = function(stackEvents, stackName, printedStatus, templateObj, bar) {
    const cfClient = new AWS.CloudFormation({apiVersion: '2010-05-15'});
    totalNum = Object.keys(templateObj.Resources).length;
    return cfClient.describeStackEvents({
        StackName: stackName
    }).promise().then((result) => {
        let updatedStackEvents = _.uniq(_.union(stackEvents, result.StackEvents), false, function(item, key, EventId){ return item.EventId;});
        updatedStackEvents = _.sortBy(updatedStackEvents,"Timestamp");
        printedStatus = printNewEvents(updatedStackEvents, printedStatus, bar);

        if ((!isDone(updatedStackEvents, stackName)) && !stackFailedComplete) {
            waitTill(CF_REFRESH_RATE);
            return getStackEvents(updatedStackEvents, stackName, printedStatus, templateObj, bar)
        } else {
            const totalTime = Math.round((Date.now() - deployStartTime) / 1000);
            if (stackFailedComplete) {
                console.log(chalk.red('Stack deployment failed.'));
            } else {
                console.log(chalk.green('Stack created succesfully. ') + ' (Resources: ' + totalNum  + '  Duration: ' + totalTime + ' seconds)');
            }
            
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

const printNewEvents = function(updatedStackEvents, printedStatus, bar) {
    var offset = 360;
    let tickNum = 0;
    let updateProgress = false;
    const lines = []
    updatedStackEvents.filter((item) => {
        return (printedStatus && !printedStatus[item.EventId]);
    }).forEach(item => {
        if (item.LogicalResourceId != stackName) {
            if (item.ResourceStatus === 'CREATE_IN_PROGRESS') {
                if(!inProgressResources.includes(item.LogicalResourceId)) {
                    inProgressResources.push(item.LogicalResourceId);
                    updateProgress = true;
                }
            } else if (item.ResourceStatus === 'CREATE_COMPLETE') {
                doneResources.push(item.LogicalResourceId);
                inProgressResources = inProgressResources.filter((element) => {
                    return element != item.LogicalResourceId;
                });
                tickNum = tickNum + 1;
                updateProgress = true;
                lines.push(chalk.white(normalizeLength(formatTime(isoDateToLocalDate(item.Timestamp, offset)), 15))  + chalk.cyan(normalizeLength(item.LogicalResourceId, 25)) + chalk.magenta(normalizeLength(item.ResourceType, 30)) + chalk.green(normalizeLength(item.ResourceStatus, 20)));
            } else if ((item.ResourceStatus === 'CREATE_FAILED')) {
                lines.push(chalk.white(normalizeLength(formatTime(isoDateToLocalDate(item.Timestamp, offset)), 15))  + chalk.cyan(normalizeLength(item.LogicalResourceId, 25)) + chalk.magenta(normalizeLength(item.ResourceType, 30)) + chalk.red(normalizeLength(item.ResourceStatus, 20)));
                lines.push(item.ResourceStatusReason);
            }
        } else if ((item.LogicalResourceId == stackName)) {
            if (item.ResourceStatus === 'CREATE_COMPLETE') {
                stackDeployComplete = true;
            } else if ((item.ResourceStatus === 'ROLLBACK_IN_PROGRESS') || (item.ResourceStatus === 'ROLLBACK_COMPLETE')) {
                lines.push(chalk.white(normalizeLength(formatTime(isoDateToLocalDate(item.Timestamp, offset)), 15))  + chalk.cyan(normalizeLength(item.LogicalResourceId, 25)) + chalk.magenta(normalizeLength(item.ResourceType, 30)) + chalk.red(normalizeLength(item.ResourceStatus, 20)));
                if (item.ResourceStatusReason) {
                    lines.push(item.ResourceStatusReason);
                }
                if (item.ResourceStatus === 'ROLLBACK_COMPLETE') {
                    stackFailedComplete = true;
                }
            }
        }
        printedStatus[item.EventId] = true;
    });
    if (lines.length > 0) {
        bar.interrupt(lines.join('\n'));
    }
    if (updateProgress) {
        bar.tick(tickNum, {
            'completedNum': 'Completed: ' + doneResources.length,
            'inProgressNum': 'In Progress: ' + inProgressResources.length
        });
    }
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

const waitTill = function(ms) {
    const waitUntill = new Date(new Date().getTime() + ms);
    while(waitUntill > new Date()){}
}