import WebSocket, { WebSocketServer } from 'ws';
import detectPort from 'detect-port';
import { URL, format } from 'url';

function getRandomPort(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

export class SimpleWebSocketServer implements AsyncDisposable {
    private _wss: WebSocketServer;
    private _isOpen: boolean;

    static async create(): Promise<SimpleWebSocketServer> {
        const wss = new WebSocketServer({
            port: await detectPort(getRandomPort(3000, 9000)),
        });

        return new SimpleWebSocketServer(wss);
    }

    private constructor(wss: WebSocketServer) {
        this._wss = wss;
        this._isOpen = true;

        this._wss.on('error', (err) => {
            this.close(1011, err.message);
        });
    }

    get wss() {
        return this._wss;
    }

    address(): URL {
        const address = this._wss.address();
        return new URL(
            typeof address === 'string'
                ? address
                : format({ protocol: 'ws', hostname: address.address, port: address.port, slashes: true }),
        );
    }

    send(message: string) {
        return Promise.all(
            Array.from(this._wss.clients).map((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    return new Promise<void>((resolve, reject) => {
                        client.send(message, (err) => {
                            err ? reject(err) : resolve();
                        });
                    });
                } else {
                    return Promise.reject(new Error(`Client is ${client.readyState}`));
                }
            }),
        );
    }

    close(code?: number, reason?: string) {
        return new Promise<void>((resolve, reject) => {
            this._wss.removeAllListeners();

            if (!this._isOpen) {
                return resolve();
            }

            this._isOpen = false;

            // If the server doesn't do this, then closing will hang.
            for (const client of this._wss.clients) {
                client.close(code, reason);
            }

            this._wss.close((err) => {
                err ? reject(err) : resolve();
            });
        });
    }

    [Symbol.asyncDispose](): PromiseLike<void> {
        return this.close(1001);
    }
}
