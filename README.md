
![alt text](https://user-images.githubusercontent.com/46061162/50387635-19e89c00-06b6-11e9-9c6e-eae089a35d0e.png)

### Install NPM package globally:
> npm i -g cfi.sh

### Deploy a template
> cfi deploy --name [stack_name] --path [template_path] --region [region]

### Notes:
This CLI tool uses default local AWS credentials for authentication to AWS. (Stored at ~/.aws by default).
Currently only supports json templates. YAML support to be added soon.
Currently only supports deploying new stacks. Update to be added soon.