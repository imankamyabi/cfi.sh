#!/usr/bin/env node

const DeployHandler = require('./lib/DeployHandler');
const program = require('commander');

program
    .version('1.9.0')
    .description('CloudFormation CLI tool');

program
    .command('deploy')
    .alias('d')
    .option('-n, --name <name>', 'Stack Name')
    .option('-p, --path <path>', 'Path to the template file')
    .option('-r, --region <region>', 'Region name')
    .action((options) => {
        DeployHandler.execute(options);
    });


program.parse(process.argv);

