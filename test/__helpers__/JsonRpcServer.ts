import EventEmitter from 'events';
import { SimpleWebSocketServer } from './SimpleWebSocketServer';
import type { URL } from 'url';
import type { App } from '../../src';
import { Rpc } from '../../src/Rpc';

type MethodRpc<TApp extends App> = {
    error(code: number, message?: string, data?: unknown): void;
    notify<TEvent extends keyof TApp['Events']>(name: TEvent, params: TApp['Events'][TEvent]['params']): void;
    result<TMethod extends keyof TApp['Methods']>(method: TMethod, result: TApp['Methods'][TMethod]['result']): void;
};

type NotificationRpc<TApp extends App> = {
    notify<TEvent extends keyof TApp['Events']>(name: TEvent, params: TApp['Events'][TEvent]['params']): void;
};

export class JsonRpcServer<TApp extends App> extends EventEmitter implements AsyncDisposable {
    static async create<TApp extends App>(): Promise<JsonRpcServer<TApp>> {
        const wss = await SimpleWebSocketServer.create();
        return new JsonRpcServer<TApp>(wss);
    }

    readonly #server: SimpleWebSocketServer;

    private constructor(wss: SimpleWebSocketServer) {
        super();
        this.#server = wss;

        this.#server.wss.on('connection', (ws) => {
            ws.on('message', (event) => {
                const {
                    jsonrpc,
                    id,
                    method,
                    params,
                    // Loop other properties back to the client.
                    ...rest
                } = JSON.parse(event.toString('utf-8'));

                // Only messages with an ID can be responded to.
                if (id) {
                    const methodRpc: MethodRpc<TApp> = {
                        result(method, result) {
                            ws.send(JSON.stringify({ ...rest, id, method, result }));
                        },
                        notify(eventName, ...params) {
                            ws.send(JSON.stringify({ ...rest, method: eventName, params }));
                        },
                        error(code, message, data) {
                            ws.send(
                                JSON.stringify({
                                    ...rest,
                                    id,
                                    error: {
                                        code,
                                        message: message || Rpc.getErrorMessage(code),
                                        data,
                                    },
                                }),
                            );
                        },
                    };

                    this.emit('method', method, params, rest, methodRpc);
                } else {
                    const notificationRpc: NotificationRpc<TApp> = {
                        notify(name, params) {
                            ws.send(JSON.stringify({ ...rest, method: name, params }));
                        },
                    };

                    this.emit('notification', method, params, rest, notificationRpc);
                }
            });
        });
    }

    get wss() {
        return this.#server.wss;
    }

    onCall<TMethod extends keyof TApp['Methods']>(
        cb: (
            method: TMethod,
            params: TApp['Methods'][TMethod]['params'],
            additionalRequestProperties: { [name: string]: any },
            rpc: MethodRpc<TApp>,
        ) => void,
    ): void {
        this.on('method', (method, params, additionalRequestProperties = {}, rpc) => {
            cb(method, params, additionalRequestProperties, rpc);
        });
    }

    onNotification<TMethod extends keyof TApp['Methods']>(
        cb: (
            method: TMethod,
            params: TApp['Methods'][TMethod]['params'],
            additionalRequestProperties: { [name: string]: any },
            rpc: NotificationRpc<TApp>,
        ) => void,
    ): void {
        this.on('notification', (method, params, additionalRequestProperties = {}, rpc) => {
            cb(method, params, additionalRequestProperties, rpc);
        });
    }

    async notify<TEvent extends keyof TApp['Events']>(
        eventName: TEvent,
        params: TApp['Events'][TEvent]['params'],
        additionalRequestProperties?: { [name: string]: any },
    ): Promise<void> {
        await this.#server.send(JSON.stringify({ ...additionalRequestProperties, method: eventName, params }));
    }

    address(): URL {
        return this.#server.address();
    }

    async close(): Promise<void> {
        await this[Symbol.asyncDispose]();
    }

    async [Symbol.asyncDispose]() {
        await this.#server[Symbol.asyncDispose]();
        this.emit('disconnected');
        this.removeAllListeners();
    }
}
