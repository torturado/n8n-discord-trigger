# n8n-discord-trigger

![n8n.io - Workflow Automation](https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png)

[n8n](https://www.n8n.io) nodes to trigger workflows from Discord messages.

This node utilizes a Discord bot to transmit or receive data from child processes when a node is executed.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Build and Docker community node deployment](#build-and-docker-community-node-deployment)  
[Bot Setup](#bot-setup)  
[Usage](#usage)  
[Version history](#version-history)  

## Bot Setup

To send, listen to messages, or fetch the list of channels or roles, you need to set up a bot using the [Discord Developer Portal](https://discord.com/developers/applications).

1. Create a new application and set it up as a bot.
2. Enable the **Privileged Gateway Intents** for Message Intent.
3. Add the bot to your server with at least **read channel permissions**.

## Installation

Quick install guide

1) Install the package in n8n (Community Nodes)

- In n8n, go to Settings > Community Nodes > Install.
- Search the npm package: `n8n-nodes-discord-bot-trigger` (or your custom name) and install it.

2) Create the “Discord Bot Trigger API” credentials

- Settings > Credentials > New > “Discord Bot Trigger API”.
- Fill in:
  - Client ID: your Discord application client ID.
  - Bot Token: your Discord bot token.
  - n8n API key: from Settings > Personal Access Tokens in n8n.
  - Base URL: your n8n API URL, e.g. `http://localhost:5678/api/v1` or `https://your-domain.tld/api/v1`.

3) Add the node and test

- In a workflow, add “Discord Trigger”.
- Choose “message” (or “direct-message”) and configure the text/pattern, server, channels, and roles.
- Run in test mode or activate the workflow, then send a matching message to trigger it.

Notes

- If you see ENOTFOUND on stop/deactivation, verify the credentials’ Base URL is resolvable and ends with `/api/v1`.
- The bot must be added to your Discord server with the required intents/permissions (see Bot Setup below).

## Build and Docker community node deployment

This section explains how to build this node locally and install it in an n8n Docker container as a community node, without publishing it to npm.

### Requirements

- Docker installed and access to the n8n container.
- A Node.js version compatible with this package.
- pnpm `>=9.1` (`corepack enable` is usually enough on modern Node.js installations).
- A self-hosted n8n container. Community nodes cannot be installed on n8n Cloud.
- The n8n volume must persist `/home/node/.n8n`; otherwise, the node will be lost when the container is recreated.

This package is already prepared for n8n because `package.json` contains:

- `keywords` with `n8n-community-node-package`.
- A package name with the `n8n-nodes-` prefix.
- The `n8n.credentials` and `n8n.nodes` sections pointing to the compiled files inside `dist`.

### 1. Build the node locally

From the repository root:

```bash
corepack enable
pnpm install
pnpm build
```

The `pnpm build` command runs TypeScript and copies the icons with gulp. When it finishes, the `dist/` directory should contain the compiled `.js`, `.d.ts`, `.map`, and node asset files.

Optionally, validate the package before installing it:

```bash
pnpm lint
```

### 2. Create the installable package

Generate a local npm tarball:

```bash
pnpm pack
```

This creates a file similar to:

```text
n8n-nodes-discord-trigger-0.9.0.tgz
```

If you change the version in `package.json`, the `.tgz` filename will change too.

You can inspect what will be installed with:

```bash
tar -tf n8n-nodes-discord-trigger-0.9.0.tgz
```

The tarball must include `package/package.json` and `package/dist/...`. If `dist/` is missing, run `pnpm build` again.

### 3. Install it in an existing n8n container

In these examples, the container is named `n8n`. If your container uses a different name, replace it in the commands.

First, copy the package into the container:

```bash
docker cp n8n-nodes-discord-trigger-0.9.0.tgz n8n:/tmp/n8n-nodes-discord-trigger-0.9.0.tgz
```

Then install the package in n8n's community nodes directory:

```bash
docker exec -u node -it n8n sh
mkdir -p ~/.n8n/nodes
cd ~/.n8n/nodes
npm install /tmp/n8n-nodes-discord-trigger-0.9.0.tgz
exit
```

Restart n8n so it loads the node:

```bash
docker restart n8n
```

When n8n starts again, open the UI and search for:

- `Discord Trigger`
- `Discord Interaction`
- The `Discord Bot Trigger API` credential

### 4. Install it with docker compose

If you use `docker compose`, the service may have a different name. Check it with:

```bash
docker compose ps
```

Copy the package and install it in the n8n service:

```bash
docker compose cp n8n-nodes-discord-trigger-0.9.0.tgz n8n:/tmp/n8n-nodes-discord-trigger-0.9.0.tgz
docker compose exec -u node n8n sh
mkdir -p ~/.n8n/nodes
cd ~/.n8n/nodes
npm install /tmp/n8n-nodes-discord-trigger-0.9.0.tgz
exit
docker compose restart n8n
```

Make sure your `docker-compose.yml` persists the n8n data directory:

```yaml
services:
  n8n:
    image: n8nio/n8n:latest
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

### 5. Reproducible option: create a Docker image with the node preinstalled

For production environments, it is usually better to create your own image instead of manually installing the `.tgz` inside an already running container.

Build and package the node:

```bash
pnpm install
pnpm build
pnpm pack
```

Create a `Dockerfile.n8n` next to the `.tgz` file:

```dockerfile
FROM n8nio/n8n:latest

USER node

COPY n8n-nodes-discord-trigger-0.9.0.tgz /tmp/n8n-nodes-discord-trigger-0.9.0.tgz

RUN mkdir -p /home/node/.n8n/nodes \
	&& cd /home/node/.n8n/nodes \
	&& npm install /tmp/n8n-nodes-discord-trigger-0.9.0.tgz \
	&& rm /tmp/n8n-nodes-discord-trigger-0.9.0.tgz
```

Build the image:

```bash
docker build -f Dockerfile.n8n -t n8n-discord-trigger:0.9.0 .
```

Use it in `docker-compose.yml`:

```yaml
services:
  n8n:
    image: n8n-discord-trigger:0.9.0
    ports:
      - "5678:5678"
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

Start or recreate the service:

```bash
docker compose up -d
```

### 6. Update an installed build

1. Bump the version in `package.json`, for example from `0.9.0` to `0.9.1`.
2. Build and package it again:

```bash
pnpm build
pnpm pack
```

3. Copy the new `.tgz` into the container.
4. Reinstall the package:

```bash
docker exec -u node -it n8n sh
cd ~/.n8n/nodes
npm install /tmp/n8n-nodes-discord-trigger-0.9.1.tgz
exit
docker restart n8n
```

If n8n still shows an older version, remove the installed package first and reinstall it:

```bash
docker exec -u node -it n8n sh
cd ~/.n8n/nodes
npm uninstall n8n-nodes-discord-trigger
npm install /tmp/n8n-nodes-discord-trigger-0.9.1.tgz
exit
docker restart n8n
```

### 7. Checks and common issues

- **The node does not appear in n8n:** confirm that you installed the package in `/home/node/.n8n/nodes` as the `node` user and restarted n8n.
- **The package disappears when the container is recreated:** persist `/home/node/.n8n` with a Docker volume or use a custom image with the node preinstalled.
- **The `.tgz` does not contain `dist/`:** run `pnpm build` before `pnpm pack`.
- **Permission error during installation:** enter the container with `docker exec -u node ...`; avoid installing as `root` inside n8n's data directory.
- **n8n does not load credentials or nodes:** check that `package.json` still keeps the paths `dist/credentials/DiscordBotTriggerApi.credentials.js`, `dist/nodes/DiscordTrigger/DiscordTrigger.node.js`, and `dist/nodes/DiscordInteraction/DiscordInteraction.node.js`.

## Usage

To use this node:

1. Install it as a community node in your n8n instance.
2. Configure the required credentials.
3. Set up triggers for Discord messages based on your use case.

For more help on setting up n8n workflows, check the [Try it out documentation](https://docs.n8n.io/try-it-out/).

## Version history

- **v0.9.0**: Add "React with Emoji" action to Discord Interaction node—bot can now add or remove reactions on messages. Fixed stability issues when multiple workflows share the same bot token.
- **v0.8.0**: Add GuildMemberUpdate trigger, add option to rename confirm button choices.
- **v0.7.0**: Add multiclient support. Multiple credentials across multiple workflows are now possible.
- **v0.6.0**: Add direct message support (Thank you [Fank](https://github.com/Fank))
- **v0.5.1**: Add additional timeout field for confirmation message
- **v0.5.0**: Add a reaction trigger on messages, add attachments to message
- **v0.4.0**: Introduce additional trigger options, such as User joins guild, User leaves guild, Role created, Role deleted or Role updated.
- **v0.3.2**: Update for multiple simultaneous trigger nodes with one bot.
- **v0.3.1**: Added additional option to trigger node to trigger on other bot messages
- **v0.3.0**: Added option to require a reference message in order to trigger the node. Enhance interaction node with a confirmation node
- **v0.2.9**: Bug fix, where a message won't trigger when multiple trigger nodes are included.
- **v0.2.8**: Multiple trigger nodes are now supported.
- **v0.2.7**: A second node Discord Interaction is added to send a message with the same credentials. Additionally roles of users can be added or removed based on interaction.
- **v0.1.5**: Initial release with message triggers and channel/role fetching capabilities.
