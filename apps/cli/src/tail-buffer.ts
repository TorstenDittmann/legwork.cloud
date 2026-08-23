const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TRUNCATION_NOTICE = "[earlier command output truncated]\n";

export class TailBuffer {
	#bytes = new Uint8Array();
	#truncated = false;

	constructor(readonly maxBytes: number) {
		if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
			throw new RangeError("maxBytes must be a positive integer");
	}

	get truncated(): boolean {
		return this.#truncated;
	}

	append(value: string | Uint8Array): void {
		const incoming = typeof value === "string" ? encoder.encode(value) : value;
		if (incoming.byteLength >= this.maxBytes) {
			const droppedBytes = this.#bytes.byteLength + incoming.byteLength > this.maxBytes;
			this.#bytes = incoming.slice(incoming.byteLength - this.maxBytes);
			this.#truncated = this.#truncated || droppedBytes;
			return;
		}

		const combined = new Uint8Array(this.#bytes.byteLength + incoming.byteLength);
		combined.set(this.#bytes);
		combined.set(incoming, this.#bytes.byteLength);
		if (combined.byteLength > this.maxBytes) {
			this.#bytes = combined.slice(combined.byteLength - this.maxBytes);
			this.#truncated = true;
		} else {
			this.#bytes = combined;
		}
	}

	toString(): string {
		if (!this.#truncated) {
			let body = decoder.decode(this.#bytes);
			while (encoder.encode(body).byteLength > this.maxBytes) body = body.slice(1);
			return body;
		}
		const noticeBytes = encoder.encode(TRUNCATION_NOTICE).byteLength;
		if (noticeBytes >= this.maxBytes) {
			let body = decoder.decode(this.#bytes);
			while (encoder.encode(body).byteLength > this.maxBytes) body = body.slice(1);
			return body;
		}
		const bodyBudget = Math.max(0, this.maxBytes - noticeBytes);
		let body = decoder.decode(this.#bytes.slice(-bodyBudget));
		while (encoder.encode(body).byteLength > bodyBudget) body = body.slice(1);
		return `${TRUNCATION_NOTICE}${body}`;
	}
}
