import { URL } from 'node:url';
import { match, ok } from 'node:assert';
import type { App, JsonRpcClient } from './interface';
import WebSocket from 'ws';
import { once } from 'node:events';
import { PendingPromises } from '@cameronhunter/pending-promises';
import { Rpc } from './Rpc';
import { EventEmitter } from 'node:events';
import { AsyncQueueHandler } from '@cameronhunter/async-emitter';

type RpcRequest = {
    /**
     * Requests have IDs, but notifications do not.
     * @see https://www.jsonrpc.org/specification#request_object
     */
    id?: number;
    jsonrpc: '2.0';
    method: string;
    params: unknown[];
};

export class WebSocketJsonRpcClient<TApp extends App> extends EventEmitter implements JsonRpcClient<URL, TApp> {
    readonly #queue: AsyncQueueHandler = new AsyncQueueHandler();
    readonly #options?: { timeout?: number | undefined };
    readonly #responses: PendingPromises = new PendingPromises();
    readonly #target: URL;

    #ws?: WebSocket;

    constructor(url: URL, options?: { timeout?: number }) {
        super();

        match(url.protocol, /wss?:/i, `${this.constructor.name} requires a WebSocket URL.`);

        this.#target = url;
        this.#options = options;
    }

    call<TMethod extends keyof TApp['Methods']>(
        method: TMethod,
        params: TApp['Methods'][TMethod]['params'],
        additionalRequestProperties?: { [name: string]: any },
    ): Promise<TApp['Methods'][TMethod]['result']> {
        return this.#send('call', String(method), params, additionalRequestProperties);
    }

    async close(): Promise<void> {
        if (!this.#ws) {
            return;
        }

        this.#ws.removeAllListeners();

        if (this.#ws.readyState !== WebSocket.CLOSED && this.#ws.readyState !== WebSocket.CLOSING) {
            const onClose = once(this.#ws, 'close', {
                signal: this.#options?.timeout ? AbortSignal.timeout(this.#options.timeout) : undefined,
            });

            this.#ws.close(1000);

            this.#responses.dispose();
            this.#queue[Symbol.dispose]();

            await onClose;
        }
    }

    async dispose(): Promise<void> {
        await this[Symbol.asyncDispose]();
    }

    async notify<TMethod extends keyof TApp['Methods']>(
        method: TMethod,
        params: TApp['Methods'][TMethod]['params'],
        additionalRequestProperties?: { [name: string]: any },
    ): Promise<void> {
        await this.#send('notification', String(method), params, additionalRequestProperties);
    }

    async open(): Promise<JsonRpcClient<URL, TApp>> {
        const ws = new WebSocket(this.target(), { timeout: this.#options?.timeout });

        const controller = new AbortController();

        if (this.#options?.timeout) {
            const timeoutSignal = AbortSignal.timeout(this.#options.timeout);
            timeoutSignal.onabort = () => controller.abort(timeoutSignal.reason);
        }

        // Create the error here so that the stack trace is good.
        const error = new Error(`Failed to open connection to ${this.target()}`);

        return Promise.race([
            once(ws, 'open', controller).then(() => {
                this.#ws = ws;

                this.#ws.onmessage = this.#queue.handle(this.#receive.bind(this));
                this.#ws.onerror = this.close.bind(this);
                this.#ws.onclose = this.close.bind(this);

                return this;
            }),
            once(ws, 'error', controller).then((event) => {
                error.cause = new Rpc.Error(Rpc.ErrorCode.ServerErrorInternalRpcError, undefined, undefined, {
                    cause: event,
                });
                throw error;
            }),
            once(ws, 'unexpected-response', controller).then(([request, response]) => {
                error.cause = new Rpc.Error(
                    // Custom code for HTTP-related errors
                    -32000,
                    `Unexpected response: ${response.statusCode} - ${response.statusMessage}`,
                    undefined,
                    { cause: response },
                );
                throw error;
            }),
        ]).finally(() => {
            controller.abort('Event race finished');
        });
    }

    target(): URL {
        return this.#target;
    }

    toString() {
        return `${this.constructor.name}<${this.target()}>`;
    }

    async [Symbol.asyncDispose]() {
        await this.close();
    }

    #send(
        type: 'call' | 'notification',
        method: string,
        params: unknown[],
        additionalRequestProperties?: { [name: string]: any },
    ) {
        ok(this.#ws, 'WebSocket is not open.');

        // Create the error here so that the stack trace is correct.
        const rejectionError = new Rpc.Error(method, params);

        const [id, response] = this.#responses.create({
            timeout: this.#options?.timeout,
            rejectionError,
        });

        const request: RpcRequest = {
            ...additionalRequestProperties,
            jsonrpc: '2.0',
            id,
            method,
            params,
        };

        /**
         * Notifications don't have IDs
         * @see https://www.jsonrpc.org/specification#notification
         */
        if (type === 'notification') {
            delete request.id;
        }

        this.#ws.send(JSON.stringify(request), (err) => {
            if (err) {
                rejectionError.cause = new Rpc.Error(Rpc.ErrorCode.TransportError, undefined, request);
                return this.#responses.reject(id, rejectionError);
            }

            /**
             * Notifications don't wait for the server to respond.
             * @see https://www.jsonrpc.org/specification#notification
             */
            if (type === 'notification') {
                return this.#responses.resolve(id, undefined);
            }
        });

        return response;
    }

    #receive(event: WebSocket.MessageEvent): void {
        const response = JSON.parse(event.data as string);

        if (response.id) {
            if (response.error) {
                const { code, message, data } = response.error;
                this.#responses.reject(response.id, new Rpc.Error(code, message, data));
            } else if (response.result) {
                this.#responses.resolve(response.id, response.result);
            }
        } else {
            // Emit notifications
            this.emit(response.method, ...response.params);
        }
    }
}
