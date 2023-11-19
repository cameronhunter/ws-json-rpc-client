import type { EventEmitter } from 'node:events';

export interface App {
    Methods: { [method: string]: { params: unknown[]; result: unknown } };
    Events: { [method: string]: { params: unknown[] } };
}

export interface JsonRpcClient<TTarget, TApp extends App> extends AsyncDisposable {
    open(): Promise<JsonRpcClient<TTarget, TApp>>;

    notify<TMethod extends keyof TApp['Methods']>(
        method: TMethod,
        params: TApp['Methods'][TMethod]['params'],
        additionalRequestProperties?: { [name: string]: any },
    ): Promise<void>;

    call<TMethod extends keyof TApp['Methods']>(
        method: TMethod,
        params: TApp['Methods'][TMethod]['params'],
        additionalRequestProperties?: { [name: string]: any },
    ): Promise<TApp['Methods'][TMethod]['result']>;

    on<TEvent extends keyof TApp['Events']>(
        eventName: TEvent,
        handler: (...params: TApp['Events'][TEvent]['params']) => void,
    ): void;
    on(eventName: string | symbol, listener: (...args: any[]) => void): this;

    once<TEvent extends keyof TApp['Events']>(
        eventName: TEvent,
        handler: (...params: TApp['Events'][TEvent]['params']) => void,
    ): this;
    once(eventName: string | symbol, listener: (...args: any[]) => void): this;

    off<TEvent extends keyof TApp['Events']>(
        eventName: TEvent,
        handler: (...params: TApp['Events'][TEvent]['params']) => void,
    ): void;
    off(eventName: string | symbol, listener: (...args: any[]) => void): this;

    close(): Promise<void>;

    dispose(): Promise<void>;

    target(): TTarget;
}
