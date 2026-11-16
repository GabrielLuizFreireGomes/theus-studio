import assert from 'node:assert/strict';
import { test } from 'node:test';
import { passwordError } from '../lib/form-validation';
import { classifyEntry, dayAvailability, matchesAgendaFilter, normalizeSearch } from '../lib/admin-agenda';

test('aceita oito caracteres e explica erro em português', () => {
  assert.equal(passwordError('12345678'), '');
  assert.match(passwordError('1234567'), /8 caracteres/);
  assert.match(passwordError('á'.repeat(37)), /longa/);
});

test('cancelamentos não ocupam o dia e bloqueios são visíveis', () => {
  assert.equal(dayAvailability(true, ['cancelled']), 'free');
  assert.equal(dayAvailability(true, ['blocked']), 'blocked');
  assert.equal(dayAvailability(false, []), 'closed');
  assert.equal(dayAvailability(true, ['scheduled', 'cancelled']), 'busy');
  assert.equal(classifyEntry('booking', 'scheduled'), 'scheduled');
  assert.equal(normalizeSearch('  João '), 'joao');
});

test('o filtro padrão mostra agendados e concluídos', () => {
  assert.equal(matchesAgendaFilter('scheduled', 'visible'), true);
  assert.equal(matchesAgendaFilter('completed', 'visible'), true);
  assert.equal(matchesAgendaFilter('cancelled', 'visible'), false);
  assert.equal(matchesAgendaFilter('blocked', 'visible'), false);
  assert.equal(matchesAgendaFilter('cancelled', 'cancelled'), true);
  assert.equal(matchesAgendaFilter('blocked', 'visible', true), true);
});
