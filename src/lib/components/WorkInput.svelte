<script lang="ts">
  import { tick } from 'svelte';
  import { normalizeSearch, searchWorks } from '#lib/tracks/search';

  let { value = $bindable(''), disabled = false } = $props<{ value?: string; disabled?: boolean }>();
  let open = $state(false);
  let active = $state(-1);
  let list = $state<HTMLDivElement>();
  const query = $derived(normalizeSearch(value));
  const suggestions = $derived(searchWorks(value));
  const expanded = $derived(open && Boolean(query) && !disabled);

  async function updateSearch() {
    open = true; active = -1;
    await tick();
    if (list) list.scrollTop = 0;
  }

  function choose(index: number) {
    const work = suggestions[index];
    if (!work) return;
    value = work.label;
    open = false;
    active = -1;
  }
  async function keydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open = true;
      if (suggestions.length) active = event.key === 'ArrowDown'
        ? (active + 1) % suggestions.length
        : (active < 0 ? suggestions.length - 1 : (active - 1 + suggestions.length) % suggestions.length);
      await tick();
      const option = list?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      if (list && option) {
        const container = list.getBoundingClientRect();
        const bounds = option.getBoundingClientRect();
        if (bounds.top < container.top) list.scrollTop += bounds.top - container.top;
        else if (bounds.bottom > container.bottom) list.scrollTop += bounds.bottom - container.bottom;
      }
    } else if (event.key === 'Enter' && expanded && active >= 0) {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      open = false;
      active = -1;
    } else if (event.key === 'Enter') open = false;
  }
</script>

<div class="work-input">
  <input id="work" type="text" role="combobox" bind:value {disabled}
    placeholder="Piece, composer or opus number…" autocomplete="off" spellcheck="false"
    aria-autocomplete="list" aria-expanded={expanded} aria-controls="work-suggestions"
    aria-activedescendant={expanded && active >= 0 ? `work-option-${active}` : undefined}
    oninput={updateSearch} onfocus={() => { open = true; }}
    onblur={() => { open = false; active = -1; }} onkeydown={keydown}/>
  {#if expanded}
    <div class="work-suggestions">
      {#if suggestions.length}<div class="suggestion-count" role="status">{suggestions.length} {suggestions.length === 1 ? 'matching piece' : 'matching pieces'}{#if suggestions.length > 5}<span>Scroll to browse</span>{/if}</div>{/if}
      <div class="suggestion-list" bind:this={list} id="work-suggestions" role="listbox" aria-label="Suggested pieces">
      {#each suggestions as work, index}
        <button id={`work-option-${index}`} type="button" role="option" aria-selected={active === index}
          tabindex="-1" class:highlighted={active === index}
          onpointerdown={event => event.preventDefault()} onclick={() => choose(index)}>{work.label}{#if work.fuzzy}<span class="approximate-match">Similar spelling</span>{/if}</button>
      {/each}
      </div>
      {#if !suggestions.length}<p class="no-suggestions" role="status">No matching pieces. You can still submit your guess.</p>{/if}
    </div>
  {/if}
</div>
