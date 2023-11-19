import type { EventEmitter } from 'node:events';

export interface App {
    Methods: { [method: string]: { params: unknown[]; result: unknown } };
    Notifications: { [method: string]: { params: unknown[] } };
}

export interface JsonRpcClient<TTarget, TApp extends App> extends AsyncDisposable {
    open(): Promise<JsonRpcClient<TTarget, TApp>>;

    notify<TNotification extends keyof TApp['Notifications']>(
        notification: TNotification,
        ...params: TApp['Notifications'][TNotification]['params']
    ): Promise<void>;

    call<TMethod extends keyof TApp['Methods']>(
        method: TMethod,
        ...params: TApp['Methods'][TMethod]['params']
    ): Promise<TApp['Methods'][TMethod]['result']>;

    on<TNotification extends keyof TApp['Notifications']>(
        notification: TNotification,
        handler: (...params: TApp['Notifications'][TNotification]['params']) => void,
    ): void;
    on(eventName: string | symbol, listener: (...args: any[]) => void): this;

    once<TNotification extends keyof TApp['Notifications']>(
        notification: TNotification,
        handler: (...params: TApp['Notifications'][TNotification]['params']) => void,
    ): this;
    once(eventName: string | symbol, listener: (...args: any[]) => void): this;

    off<TNotification extends keyof TApp['Notifications']>(
        notification: TNotification,
        handler: (...params: TApp['Notifications'][TNotification]['params']) => void,
    ): void;
    off(eventName: string | symbol, listener: (...args: any[]) => void): this;

    close(): Promise<void>;

    dispose(): Promise<void>;

    target(): TTarget;
}
