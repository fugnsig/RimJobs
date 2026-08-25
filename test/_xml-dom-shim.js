const { DOMParser: XmlDOMParser } = require('@xmldom/xmldom');

function elementChildren(node) {
  const result = [];
  const children = node && node.childNodes;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      if (children[i].nodeType === 1) result.push(children[i]);
    }
  }
  return result;
}

function descendants(node, tag) {
  const result = [];
  const elements = node.getElementsByTagName(tag);
  for (let i = 0; i < elements.length; i++) result.push(elements[i]);
  return result;
}

function selectAll(node, selector) {
  const value = String(selector).trim();
  if (value.indexOf(',') >= 0) {
    let result = [];
    const selectors = value.split(',');
    for (let i = 0; i < selectors.length; i++) {
      result = result.concat(selectAll(node, selectors[i].trim()));
    }
    return result;
  }
  if (value.indexOf('>') >= 0) {
    const parts = value.split('>').map(item => item.trim());
    let result = [];
    const ancestors = descendants(node, parts[0]);
    for (let i = 0; i < ancestors.length; i++) {
      result = result.concat(elementChildren(ancestors[i])
        .filter(child => child.tagName === parts[1]));
    }
    return result;
  }
  return descendants(node, value);
}

function patchChain(object) {
  let prototype = Object.getPrototypeOf(object);
  while (prototype) {
    if (!prototype.__rimjobsQueryPatched && typeof prototype.getElementsByTagName === 'function') {
      prototype.__rimjobsQueryPatched = true;
      prototype.querySelectorAll = function (selector) { return selectAll(this, selector); };
      prototype.querySelector = function (selector) {
        const matches = selectAll(this, selector);
        return matches.length ? matches[0] : null;
      };
      if (!Object.getOwnPropertyDescriptor(prototype, 'children')) {
        Object.defineProperty(prototype, 'children', {
          get() { return elementChildren(this); },
          configurable: true,
        });
      }
    }
    prototype = Object.getPrototypeOf(prototype);
  }
}

const SILENT = { errorHandler() {}, locator: {} };
function DOMParserShim() {}
DOMParserShim.prototype.parseFromString = function (source, type) {
  const document = new XmlDOMParser(SILENT)
    .parseFromString(String(source || ''), type || 'text/xml');
  patchChain(document);
  if (document.documentElement) patchChain(document.documentElement);
  return document;
};

module.exports = { DOMParserShim };
