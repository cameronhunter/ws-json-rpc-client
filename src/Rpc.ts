import { ok } from 'node:assert';

type MethodAndParams = [method: string, params: unknown[]];
type RpcErrorResponse = [code: Rpc.ErrorCode | number, message?: string, data?: unknown, options?: { cause?: unknown }];

function isMethodAndParams(args: MethodAndParams | RpcErrorResponse): args is MethodAndParams {
    return typeof args[0] === 'string';
}

class RpcError extends Error {
    readonly #method?: string;
    readonly #params?: unknown[];
    readonly #code?: Rpc.ErrorCode;
    readonly #message?: string;
    readonly #data?: unknown;

    constructor(...args: MethodAndParams | RpcErrorResponse) {
        super();

        this.name = 'RpcError';

        if (isMethodAndParams(args)) {
            const [method, params] = args;
            this.#method = method;
            this.#params = params;
        } else {
            const [code, message, data, options] = args;
            this.#code = code;
            this.#message = message as string | undefined;
            this.#data = data;

            if (options?.cause) {
                this.cause = options.cause;
            } else if (data) {
                // We add the data as the cause so that it's included in the stack
                this.cause = data;
            }
        }
    }

    get method() {
        return this.#method;
    }

    get params() {
        return this.#params;
    }

    get code() {
        return this.#code;
    }

    get rpcMessage(): string | undefined {
        return this.#message;
    }

    get data(): unknown {
        return this.#data;
    }

    get message(): string {
        if (this.method && this.params) {
            return `${this.#method}(${this.params.map((v) => JSON.stringify(v)).join(', ')}) failed.`;
        }

        return `${this.code}${this.rpcMessage ? ` - ${this.rpcMessage}` : ''}`;
    }
}

export namespace Rpc {
    export class Error extends RpcError {}

    /**
     * The error codes from and including -32768 to -32000 are reserved for
     * pre-defined errors. Any code within this range, but not defined
     * explicitly below is reserved for future use. The error codes are nearly
     * the same as those suggested for [XML-RPC](http://xmlrpc-epi.sourceforge.net/specs/rfc.fault_codes.php).
     *
     * @see https://www.jsonrpc.org/specification#error_object
     */
    export enum ErrorCode {
        ApplicationError = -32500,

        ParseErrorInvalidCharacterForEncoding = -32702,

        /**
         * Invalid JSON was received by the server.
         * An error occurred on the server while parsing the JSON text.
         */
        ParseErrorNotWellFormed = -32700,

        ParseErrorUnsupportedEncoding = -32701,

        /**
         * Internal JSON-RPC error.
         */
        ServerErrorInternalRpcError = -32603,

        /**
         * Invalid method parameter(s).
         */
        ServerErrorInvalidMethodParameters = -32602,

        /**
         * The JSON sent is not a valid Request object.
         */
        ServerErrorInvalidRpcNotConformingToSpec = -32600,

        /**
         * The method does not exist / is not available.
         */
        ServerErrorRequestedMethodNotFound = -32601,

        SystemError = -32400,

        TransportError = -32300,
    }

    export function isValidErrorCode(code: ErrorCode | number): asserts code is ErrorCode {
        ok(code >= -32768 && code <= -32000, 'Invalid RPC error code.');
    }

    export function getErrorMessage(code: ErrorCode | number): string | undefined {
        isValidErrorCode(code);

        switch (code) {
            case ErrorCode.ApplicationError:
                return 'Application error';
            case ErrorCode.ParseErrorInvalidCharacterForEncoding:
                return 'Parse error. Invalid character for encoding.';
            case ErrorCode.ParseErrorNotWellFormed:
                return 'Parse error. Not well formed.';
            case ErrorCode.ParseErrorUnsupportedEncoding:
                return 'Parse error. Unsupported encoding.';
            case ErrorCode.ServerErrorInternalRpcError:
                return 'Server error. Internal RPC error.';
            case ErrorCode.ServerErrorInvalidMethodParameters:
                return 'Server error. Invalid method parameters.';
            case ErrorCode.ServerErrorInvalidRpcNotConformingToSpec:
                return 'Server error. Invalid RPC not conforming to spec.';
            case ErrorCode.ServerErrorRequestedMethodNotFound:
                return 'Server error. Requested method not found.';
            case ErrorCode.SystemError:
                return 'System error.';
            case ErrorCode.TransportError:
                return 'Transport error.';
            default: {
                if (code >= -32099 && code <= -32000) {
                    return 'Server error.';
                }

                return undefined;
            }
        }
    }
}
