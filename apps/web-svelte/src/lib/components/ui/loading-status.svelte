<script lang="ts">
	let { label }: { label: string } = $props();
</script>

<span class="sr-only" role="status" aria-live="polite">{label}</span>
