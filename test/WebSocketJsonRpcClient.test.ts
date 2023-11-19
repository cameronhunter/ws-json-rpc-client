import { Rpc } from '../src/Rpc';
import { WebSocketConnection } from '../src/index';
import { JsonRpcServer } from './__helpers__/JsonRpcServer';

interface MyApp {
    Methods: {
        hello: { params: [name: string]; result: string };
    };
    Events: {
        saidHelloTo: { params: [text: string] };
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

        server.onCall((method, params, properties, rpc) => {
            if (method === 'hello') {
                rpc.result(method, `Hello ${params[0]}!`);
            }
        });

        await using client = await new WebSocketConnection<MyApp>(server.address()).open();

        const response = client.call('hello', ['world']);

        await expect(response).resolves.toBe('Hello world!');
    });

    test('rejects on errors sent from the server', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        server.onCall((method, params, properties, rpc) => {
            rpc.error(Rpc.ErrorCode.ServerErrorRequestedMethodNotFound);
        });

        await using client = await new WebSocketConnection<MyApp>(server.address()).open();

        const response = client.call('hello', ['world']);

        await expect(response).rejects.toThrow('hello("world") failed.');
        await expect(response).rejects.toHaveProperty(
            'cause.message',
            '-32601 - Server error. Requested method not found.',
        );
    });

    test.todo('rejects when the WebSocket fails to send');

    test('rejects on timeout', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        server.onCall(() => {
            // Do nothing to cause a timeout.
        });

        await using client = await new WebSocketConnection<MyApp>(server.address(), { timeout: 5 }).open();

        const response = client.call('hello', ['world']);

        await expect(response).rejects.toThrow('hello("world") failed.');
        await expect(response).rejects.toHaveProperty('cause.message', 'Promise timed out after 5ms');
    });

    test('sends additional properties', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        const notificationReceived = new Promise((resolve) => {
            server.onNotification((notification, params, additionalRequestProperties) => {
                if (notification === 'hello') {
                    resolve(additionalRequestProperties);
                }
            });
        });

        await using client = await new WebSocketConnection<MyApp>(server.address()).open();

        await client.notify('hello', ['world'], { sessionId: 1 });

        await expect(notificationReceived).resolves.toEqual({ sessionId: 1 });
    });
});

describe('notify', () => {
    test('resolves without requiring a server response', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        const methodReceived = new Promise((resolve) => {
            server.onCall((method, params, additionalRequestProperties, rpc) => {
                if (method === 'hello') {
                    rpc.result(method, `Hello ${params[0]}!`);
                    resolve(additionalRequestProperties);
                }
            });
        });

        await using client = await new WebSocketConnection<MyApp>(server.address()).open();

        const response = client.call('hello', ['world'], { sessionId: 10 });

        await expect(response).resolves.toBe('Hello world!');
        await expect(methodReceived).resolves.toEqual({ sessionId: 10 });
    });

    test.todo('rejects when the WebSocket fails to send');

    test('sends additional properties', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        const notificationReceived = new Promise((resolve) => {
            server.onNotification((notification, params, additionalRequestProperties) => {
                if (notification === 'hello') {
                    resolve(additionalRequestProperties);
                }
            });
        });

        await using client = await new WebSocketConnection<MyApp>(server.address()).open();

        await client.notify('hello', ['world'], { sessionId: 1 });

        await expect(notificationReceived).resolves.toEqual({ sessionId: 1 });
    });
});

describe('on', () => {
    test('listens for notifications to be received from the server', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        await using client = await new WebSocketConnection<MyApp>(server.address()).open();

        const notificationReceived = new Promise((resolve) => {
            client.on('saidHelloTo', (params, requestProperties) => resolve([params, requestProperties]));
        });

        await server.notify('saidHelloTo', ['world'], { sessionId: 3 });

        await expect(notificationReceived).resolves.toEqual([['world'], { sessionId: 3 }]);
    });
});

describe('off', () => {
    test('removes listeners for notifications', async () => {
        await using server = await JsonRpcServer.create<MyApp>();

        await using client = (await new WebSocketConnection<MyApp>(
            server.address(),
        ).open()) as WebSocketConnection<MyApp>;

        const listener = jest.fn();

        expect(client.listenerCount('shoutIntoTheVoid')).toBe(0);

        client.on('shoutIntoTheVoid', listener);

        expect(client.listenerCount('shoutIntoTheVoid')).toBe(1);

        client.off('shoutIntoTheVoid', listener);

        expect(client.listenerCount('shoutIntoTheVoid')).toBe(0);
    });
});
