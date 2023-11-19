import { Rpc } from '../src/Rpc';
import { WebSocketConnection } from '../src/index';
import { JsonRpcServer } from './__helpers__/JsonRpcServer';
import { setImmediate } from 'node:timers/promises';

interface MyApp {
    Methods: {
        hello: { params: [name: string]; result: string };
    };
    Notifications: {
        shoutIntoTheVoid: { params: [text: string] };
    };
}

describe('open', () => {
    test('resolves when connected successfully', async () => {
        await using server = await JsonRpcServer.create();
        await using client = new WebSocketConnection(server.address());

        await expect(client.open()).resolves.toEqual(expect.any(WebSocketConnection));
    });

    test('rejects when it receives an unexpected response from the server', async () => {
        await using server = await JsonRpcServer.create();

        server.wss.shouldHandle = () => false;

        await using client = new WebSocketConnection(server.address());

        const promise = client.open();

        await expect(promise).rejects.toThrow();
        await expect(promise).rejects.toHaveProperty('message', `Failed to open connection to ${server.address()}`);
        await expect(promise).rejects.toHaveProperty(
            'cause.message',
            '-32000 - Unexpected response: 400 - Bad Request',
        );
    });

    test.todo('rejects when the WebSocket sends an error event');
});

describe('call', () => {
    test('resolves a sent command', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        server.onMethod((method, params, rpc) => {
            if (method === 'hello') {
                rpc.result(method, `Hello ${params[0]}!`);
            }
        });

        await using client = await new WebSocketConnection<MyApp>(server.address()).open();

        const response = client.call('hello', 'world');

        await expect(response).resolves.toBe('Hello world!');
    });

    test('rejects on errors sent from the server', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        server.onMethod((method, params, rpc) => {
            rpc.error(Rpc.ErrorCode.ServerErrorRequestedMethodNotFound);
        });

        await using client = await new WebSocketConnection<MyApp>(server.address()).open();

        const response = client.call('hello', 'world');

        await expect(response).rejects.toThrow('hello("world") failed.');
        await expect(response).rejects.toHaveProperty(
            'cause.message',
            '-32601 - Server error. Requested method not found.',
        );
    });

    test.todo('rejects when the WebSocket fails to send');

    test('rejects on timeout', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        server.onMethod(() => {
            // Do nothing to cause a timeout.
        });

        await using client = await new WebSocketConnection<MyApp>(server.address(), { timeout: 5 }).open();

        const response = client.call('hello', 'world');

        await expect(response).rejects.toThrow('hello("world") failed.');
        await expect(response).rejects.toHaveProperty('cause.message', 'Promise timed out after 5ms');
    });
});

describe('notify', () => {
    test('resolves without requiring a server response', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        const notificationReceived = new Promise((resolve) => {
            server.onNotification((notification, params) => {
                if (notification === 'shoutIntoTheVoid') {
                    resolve(params[0]);
                }
            });
        });

        await using client = await new WebSocketConnection<MyApp>(server.address()).open();

        const response = client.notify('shoutIntoTheVoid', 'Ahhhhh!');

        await expect(response).resolves.toBeUndefined();
        await expect(notificationReceived).resolves.toBe('Ahhhhh!');
    });

    test.todo('rejects when the WebSocket fails to send');
});

describe('on', () => {
    test('listens for notifications to be received from the server', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        await using client = await new WebSocketConnection<MyApp>(server.address()).open();

        const notificationReceived = new Promise((resolve) => {
            client.on('shoutIntoTheVoid', resolve);
        });

        await server.notify('shoutIntoTheVoid', 'Ahhhhh!');

        await expect(notificationReceived).resolves.toBe('Ahhhhh!');
    });
});

describe('off', () => {
    test('removes listeners for notifications', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        await using client = await new WebSocketConnection<MyApp>(server.address()).open();

        const listener = jest.fn();

        expect(client.listenerCount('shoutIntoTheVoid')).toBe(0);

        client.on('shoutIntoTheVoid', listener);

        expect(client.listenerCount('shoutIntoTheVoid')).toBe(1);

        client.off('shoutIntoTheVoid', listener);

        expect(client.listenerCount('shoutIntoTheVoid')).toBe(0);
    });
});
