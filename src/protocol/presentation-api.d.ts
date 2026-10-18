// Presentation API (https://w3c.github.io/presentation-api/) is not in lib.dom; Chrome and Edge
// implement it. Only the parts this app uses are declared.

type PresentationConnectionState = 'connecting' | 'connected' | 'closed' | 'terminated';

interface PresentationConnection extends EventTarget {
  readonly id: string;
  readonly url: string;
  readonly state: PresentationConnectionState;
  binaryType: 'blob' | 'arraybuffer';
  send(data: string | ArrayBuffer | ArrayBufferView | Blob): void;
  close(): void;
  terminate(): void;
  onconnect: ((this: PresentationConnection, ev: Event) => unknown) | null;
  onclose: ((this: PresentationConnection, ev: Event) => unknown) | null;
  onterminate: ((this: PresentationConnection, ev: Event) => unknown) | null;
  onmessage: ((this: PresentationConnection, ev: MessageEvent) => unknown) | null;
}

interface PresentationConnectionAvailableEvent extends Event {
  readonly connection: PresentationConnection;
}

interface PresentationAvailability extends EventTarget {
  readonly value: boolean;
  onchange: ((this: PresentationAvailability, ev: Event) => unknown) | null;
}

interface PresentationRequest extends EventTarget {
  start(): Promise<PresentationConnection>;
  reconnect(presentationId: string): Promise<PresentationConnection>;
  getAvailability(): Promise<PresentationAvailability>;
  onconnectionavailable:
    ((this: PresentationRequest, ev: PresentationConnectionAvailableEvent) => unknown) | null;
}

// eslint-disable-next-line no-var -- a global constructor has to be declared with var
declare var PresentationRequest: {
  prototype: PresentationRequest;
  new (urls: string | string[]): PresentationRequest;
};

interface PresentationConnectionList extends EventTarget {
  readonly connections: readonly PresentationConnection[];
  onconnectionavailable:
    ((this: PresentationConnectionList, ev: PresentationConnectionAvailableEvent) => unknown) | null;
}

interface PresentationReceiver {
  readonly connectionList: Promise<PresentationConnectionList>;
}

interface Presentation {
  defaultRequest: PresentationRequest | null;
  readonly receiver: PresentationReceiver | null;
}

interface Navigator {
  readonly presentation?: Presentation;
}
