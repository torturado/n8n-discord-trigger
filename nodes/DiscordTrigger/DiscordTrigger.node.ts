import {
    type INodeType,
    type INodeTypeDescription,
    type ITriggerFunctions,
    type ITriggerResponse,
    type INodePropertyOptions,
    NodeConnectionType,
    NodeOperationError,
} from 'n8n-workflow';
import { options } from './DiscordTrigger.node.options';
import bot from '../bot';
import ipc from 'node-ipc';
import {
    connection,
    ICredentials,
    getChannels as getChannelsHelper,
    getRoles as getRolesHelper,
    getGuilds as getGuildsHelper,
} from '../helper';
import { connectionManager } from '../connectionManager';

// we start the bot if we are in the main process
if (!process.send) bot();

function removeIpcListener(eventName: string, handler: (...args: any[]) => void) {
    const botSocket = ipc.of?.bot as any;
    if (!botSocket) return;

    if (typeof botSocket.off === 'function') {
        botSocket.off(eventName, handler);
        return;
    }

    if (typeof botSocket.removeListener === 'function') {
        botSocket.removeListener(eventName, handler);
    }
}

export class DiscordTrigger implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Discord Trigger',
        name: 'discordTrigger',
        group: ['trigger', 'discord'],
        version: 1,
        description: 'Discord Trigger on message',
        defaults: {
            name: 'Discord Trigger',
        },
        icon: 'file:discord-logo.svg',
    inputs: [],
    // eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
    outputs: [NodeConnectionType.Main],
        credentials: [
            {
                name: 'discordBotTriggerApi',
                required: true,
            },
        ],
        properties: options,
    };

    methods = {
        loadOptions: {
            async getGuilds(): Promise<INodePropertyOptions[]> {
                return await getGuildsHelper(this).catch((e) => e) as { name: string; value: string }[];
            },
            async getChannels(): Promise<INodePropertyOptions[]> {
                // @ts-ignore
                const selectedGuilds = this.getNodeParameter('guildIds', []);
                if (!selectedGuilds.length) {
                    // @ts-ignore
                    throw new NodeOperationError('Please select at least one server before choosing channels.');
                }

                return await getChannelsHelper(this, selectedGuilds).catch((e) => e) as { name: string; value: string }[];
            },
            async getRoles(): Promise<INodePropertyOptions[]> {
                // @ts-ignore
                const selectedGuilds = this.getNodeParameter('guildIds', []);
                if (!selectedGuilds.length) {
                    // @ts-ignore
                    throw new NodeOperationError('Please select at least one server before choosing channels.');
                }


                return await getRolesHelper(this, selectedGuilds).catch((e) => e) as { name: string; value: string }[];
            },
        },
    };

    async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {

        const credentials = (await this.getCredentials('discordBotTriggerApi').catch((e) => e)) as any as ICredentials;

        if (!credentials?.token) {
            console.log("No token given.");

            return {};
        }

        await connection(credentials).catch((e) => e);

        const registeredHandlers: Array<{ eventName: string; handler: (...args: any[]) => void }> = [];

        ipc.connectTo('bot', () => {
            console.log('Connected to IPC server');
            
            const currentNodeId = this.getNode().id;
            
            // Check if this node is already registered to prevent duplicate event listeners
            // This can happen when a workflow is reactivated while the IPC connection is still alive
            const isNewRegistration = connectionManager.connect(currentNodeId);
            
            const parameters: any = {};
            Object.keys(this.getNode().parameters).forEach((key) => {
                parameters[key] = this.getNodeParameter(key, '') as any;
            });

            // Always emit triggerNodeRegistered to update the bot's node parameters
            // (in case they changed between activations)
            ipc.of.bot.emit('triggerNodeRegistered', {
                parameters,
                active: this.getWorkflow().active,
                credentials,
                token: credentials.token,
                nodeId: currentNodeId,
            });

            // Skip adding event listeners if this node is already registered
            // to prevent duplicate events
            if (!isNewRegistration) {
                console.log(`Node ${currentNodeId} already has listeners registered. Skipping.`);
                return;
            }

            const messageCreateHandler = ({ message, author, guild, nodeId, messageReference, attachments, referenceAuthor }: any) => {
                if( this.getNode().id === nodeId) {
                    console.log("received messageCreate event", message.id);

                    const messageCreateOptions : any = {
                        id: message.id,
                        content: message.content,
                        guildId: guild?.id,
                        channelId: message.channelId,
                        authorId: author.id,
                        authorName: author.username,
                        timestamp: message.createdTimestamp,
                        listenValue: this.getNodeParameter('value', ''),
                        authorIsBot: author.bot || author.system,
                        referenceId: null,
                        referenceContent: null,
                        referenceAuthorId: null,
                        referenceAuthorName: null,
                        referenceTimestamp: null,
                    }

                    if(messageReference) {
                        messageCreateOptions.referenceId = messageReference.id;
                        messageCreateOptions.referenceContent = messageReference.content;
                        messageCreateOptions.referenceAuthorId = referenceAuthor.id;
                        messageCreateOptions.referenceAuthorName = referenceAuthor.username;
                        messageCreateOptions.referenceTimestamp = messageReference.createdTimestamp;
                    }

                    if (attachments) {
                        messageCreateOptions.attachments = attachments;
                    }

                    this.emit([
                        this.helpers.returnJsonArray(messageCreateOptions),
                    ]);
                }
            };
            ipc.of.bot.on('messageCreate', messageCreateHandler);
            registeredHandlers.push({ eventName: 'messageCreate', handler: messageCreateHandler });

            const guildMemberAddHandler = ({guildMember, guild, user, nodeId}: any) => {
                if( this.getNode().id === nodeId) {
                    this.emit([
                        this.helpers.returnJsonArray(guildMember),
                    ]);
                }
            };
            ipc.of.bot.on('guildMemberAdd', guildMemberAddHandler);
            registeredHandlers.push({ eventName: 'guildMemberAdd', handler: guildMemberAddHandler });

            const guildMemberRemoveHandler = ({guildMember, guild, user, nodeId}: any) => {
                if( this.getNode().id === nodeId) {
                    this.emit([
                        this.helpers.returnJsonArray(guildMember),
                    ]);
                }
            };
            ipc.of.bot.on('guildMemberRemove', guildMemberRemoveHandler);
            registeredHandlers.push({ eventName: 'guildMemberRemove', handler: guildMemberRemoveHandler });

            const guildMemberUpdateHandler = ({oldMember, newMember, guild, nodeId}: any) => {
                if( this.getNode().id === nodeId) {

                    const addPrefix = (obj: any, prefix: string) =>
                        Object.fromEntries(Object.entries(obj).map(([key, value]) => [`${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`, value]));

                    const mergedGuildMemberUpdateOptions: any = {
                        ...addPrefix(oldMember, "old"),
                        ...addPrefix(newMember, "new"),
                        ...addPrefix(guild, "guild"),
                    };

                    this.emit([
                        this.helpers.returnJsonArray(mergedGuildMemberUpdateOptions),
                    ]);
                }
            };
            ipc.of.bot.on('guildMemberUpdate', guildMemberUpdateHandler);
            registeredHandlers.push({ eventName: 'guildMemberUpdate', handler: guildMemberUpdateHandler });

            const messageReactionAddHandler = ({messageReaction, message, user, guild, nodeId}: any) => {
                if( this.getNode().id === nodeId) {
                    this.emit([
                        this.helpers.returnJsonArray({...messageReaction, ...user, channelId: message.channelId, guildId: guild.id}),
                    ]);
                }
            };
            ipc.of.bot.on('messageReactionAdd', messageReactionAddHandler);
            registeredHandlers.push({ eventName: 'messageReactionAdd', handler: messageReactionAddHandler });

            const messageReactionRemoveHandler = ({messageReaction, message, user, guild, nodeId}: any) => {
                if(this.getNode().id === nodeId) {
                    this.emit([
                        this.helpers.returnJsonArray({...messageReaction, ...user, channelId: message.channelId, guildId: guild.id}),
                    ]);
                }
            };
            ipc.of.bot.on('messageReactionRemove', messageReactionRemoveHandler);
            registeredHandlers.push({ eventName: 'messageReactionRemove', handler: messageReactionRemoveHandler });

            const roleCreateHandler = ({role, guild, nodeId}: any) => {
                if( this.getNode().id === nodeId) {
                    this.emit([
                        this.helpers.returnJsonArray(role),
                    ]);
                }
            };
            ipc.of.bot.on('roleCreate', roleCreateHandler);
            registeredHandlers.push({ eventName: 'roleCreate', handler: roleCreateHandler });

            const roleDeleteHandler = ({role, guild, nodeId}: any) => {
                if( this.getNode().id === nodeId) {
                    this.emit([
                        this.helpers.returnJsonArray(role),
                    ]);
                }
            };
            ipc.of.bot.on('roleDelete', roleDeleteHandler);
            registeredHandlers.push({ eventName: 'roleDelete', handler: roleDeleteHandler });

            const roleUpdateHandler = ({oldRole, newRole, guild, nodeId}: any) => {
                if( this.getNode().id === nodeId) {

                    const addPrefix = (obj: any, prefix: string) =>
                        Object.fromEntries(Object.entries(obj).map(([key, value]) => [`${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`, value]));

                    const mergedRoleOptions: any = {
                        ...addPrefix(oldRole, "old"),
                        ...addPrefix(newRole, "new")
                    };

                    this.emit([
                        this.helpers.returnJsonArray(mergedRoleOptions),
                    ]);
                }
            };
            ipc.of.bot.on('roleUpdate', roleUpdateHandler);
            registeredHandlers.push({ eventName: 'roleUpdate', handler: roleUpdateHandler });
        });

        ipc.of.bot.on('disconnect', () => {
            console.error('Disconnected from IPC server');
        });

        // Return the cleanup function
        return {
            closeFunction: async () => {
                // remove the node from being executed
                console.log("removing trigger node");

                const currentNodeId = this.getNode().id;
                for (const { eventName, handler } of registeredHandlers) {
                    removeIpcListener(eventName, handler);
                }
                if (registeredHandlers.length > 0) {
                    connectionManager.unregister(currentNodeId);
                }

                // Send message to bot process to deregister this node, then disconnect if needed
                ipc.connectTo('bot', () => {
                    ipc.of.bot.emit('triggerNodeRemoved', { nodeId: currentNodeId });
                    // Disconnect after the message is sent
                    connectionManager.disconnect(currentNodeId);
                });
            },
        };
    }
}
