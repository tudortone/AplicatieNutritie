'use strict';

function numeProprietateStatic(nod) {
  if (!nod) return null;
  if (!nod.computed && nod.property?.type === 'Identifier') {
    return nod.property.name;
  }
  if (nod.computed && nod.property?.type === 'Literal') {
    return typeof nod.property.value === 'string' ? nod.property.value : null;
  }
  return null;
}

function numeCheieStatica(nod) {
  if (!nod) return null;
  if (!nod.computed && nod.key?.type === 'Identifier') return nod.key.name;
  if (nod.key?.type === 'Literal') {
    return typeof nod.key.value === 'string' ? nod.key.value : null;
  }
  return null;
}

function esteCheieServiceRole(nume) {
  const normalizat = String(nume || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalizat.includes('servicerole') && normalizat.includes('key');
}

function createNoServiceRoleBypassRule(tabeleUtilizator) {
  const tabele = new Set(tabeleUtilizator);

  return {
    meta: {
      type: 'problem',
      docs: {
        description: 'Interzice expunerea sau folosirea service_role ca DB de utilizator.',
      },
      schema: [],
      messages: {
        contextDb:
          'TASK-001: clientul service_role nu poate fi atribuit ca db al contextului de cerere.',
        userTable:
          'TASK-001: clientul service_role nu poate accesa direct tabela RLS {{table}}.',
      },
    },

    create(context) {
      const sourceCode = context.sourceCode;
      const cheiServiceRole = new Set();
      const clientiServiceRole = new Set();
      const clientiRls = new Set();
      const proprietatiServiceRole = new Map();

      function variabilaPentru(identifier) {
        if (!identifier || identifier.type !== 'Identifier') return null;
        let scope = sourceCode.getScope(identifier);
        while (scope) {
          const variabila = scope.set?.get(identifier.name);
          if (variabila) return variabila;
          scope = scope.upper;
        }
        return null;
      }

      function variabilaDeclarata(nod) {
        return sourceCode.getDeclaredVariables(nod)[0] || null;
      }

      function referaCheieServiceRole(nod) {
        if (!nod) return false;
        if (nod.type === 'Identifier') {
          return cheiServiceRole.has(variabilaPentru(nod));
        }
        if (nod.type === 'MemberExpression') {
          if (esteCheieServiceRole(numeProprietateStatic(nod))) return true;
          return referaCheieServiceRole(nod.object) || referaCheieServiceRole(nod.property);
        }
        if (nod.type === 'ChainExpression') return referaCheieServiceRole(nod.expression);
        return false;
      }

      function esteCreareClientServiceRole(nod) {
        if (!nod || nod.type !== 'CallExpression') return false;
        const callee = nod.callee;
        const numeCallee = callee.type === 'Identifier'
          ? callee.name
          : numeProprietateStatic(callee);
        return numeCallee === 'createClient' && referaCheieServiceRole(nod.arguments[1]);
      }

      function esteClientRls(nod) {
        if (!nod) return false;
        if (nod.type === 'Identifier') {
          return clientiRls.has(variabilaPentru(nod));
        }
        if (nod.type === 'CallExpression') {
          const callee = nod.callee;
          const numeCallee = callee.type === 'Identifier'
            ? callee.name
            : numeProprietateStatic(callee);
          return numeCallee === 'creeazaClientUtilizator';
        }
        if (nod.type === 'ChainExpression') return esteClientRls(nod.expression);
        return false;
      }

      function esteClientServiceRole(nod) {
        if (!nod) return false;
        if (esteCreareClientServiceRole(nod)) return true;
        if (nod.type === 'Identifier') {
          return clientiServiceRole.has(variabilaPentru(nod));
        }
        if (nod.type === 'MemberExpression') {
          const variabilaObiect = nod.object.type === 'Identifier'
            ? variabilaPentru(nod.object)
            : null;
          const proprietate = numeProprietateStatic(nod);
          return Boolean(
            variabilaObiect &&
            proprietate &&
            proprietatiServiceRole.get(variabilaObiect)?.has(proprietate),
          );
        }
        if (nod.type === 'ChainExpression') return esteClientServiceRole(nod.expression);
        return false;
      }

      function marcheazaProprietateServiceRole(memberExpression) {
        if (memberExpression.object.type !== 'Identifier') return;
        const variabila = variabilaPentru(memberExpression.object);
        const proprietate = numeProprietateStatic(memberExpression);
        if (!variabila || !proprietate) return;
        if (!proprietatiServiceRole.has(variabila)) {
          proprietatiServiceRole.set(variabila, new Set());
        }
        proprietatiServiceRole.get(variabila).add(proprietate);
      }

      return {
        VariableDeclarator(nod) {
          if (nod.id.type !== 'Identifier' || !nod.init) return;
          const variabila = variabilaDeclarata(nod);
          if (!variabila) return;

          if (referaCheieServiceRole(nod.init)) cheiServiceRole.add(variabila);
          if (esteClientServiceRole(nod.init)) clientiServiceRole.add(variabila);
          if (esteClientRls(nod.init)) clientiRls.add(variabila);

          if (nod.init.type === 'ObjectExpression') {
            for (const proprietate of nod.init.properties) {
              if (
                proprietate.type === 'Property' &&
                esteClientServiceRole(proprietate.value)
              ) {
                const cheie = numeCheieStatica(proprietate);
                if (!cheie) continue;
                if (!proprietatiServiceRole.has(variabila)) {
                  proprietatiServiceRole.set(variabila, new Set());
                }
                proprietatiServiceRole.get(variabila).add(cheie);
              }
            }
          }
        },

        AssignmentExpression(nod) {
          if (nod.left.type === 'Identifier') {
            const variabila = variabilaPentru(nod.left);
            if (variabila && esteClientServiceRole(nod.right)) {
              clientiServiceRole.add(variabila);
            }
            if (variabila && esteClientRls(nod.right)) clientiRls.add(variabila);
            return;
          }
          if (nod.left.type !== 'MemberExpression') return;
          if (numeProprietateStatic(nod.left) === 'db') {
            if (!esteClientRls(nod.right)) {
              context.report({ node: nod.left, messageId: 'contextDb' });
            }
          }
          if (esteClientServiceRole(nod.right)) {
            marcheazaProprietateServiceRole(nod.left);
          }
        },

        Property(nod) {
          if (
            numeCheieStatica(nod) === 'db' &&
            !esteClientRls(nod.value)
          ) {
            context.report({ node: nod, messageId: 'contextDb' });
          }
        },

        CallExpression(nod) {
          if (nod.callee.type !== 'MemberExpression') return;
          if (numeProprietateStatic(nod.callee) !== 'from') return;
          if (!esteClientServiceRole(nod.callee.object)) return;
          const argumentTabela = nod.arguments[0];
          if (argumentTabela?.type !== 'Literal' || typeof argumentTabela.value !== 'string') {
            return;
          }
          if (tabele.has(argumentTabela.value)) {
            context.report({
              node: nod,
              messageId: 'userTable',
              data: { table: argumentTabela.value },
            });
          }
        },
      };
    },
  };
}

module.exports = createNoServiceRoleBypassRule;
