/* @noflow */

import type { NodePath } from "@babel/traverse";
import wrapFunction from "@babel/helper-wrap-function";
import annotateAsPure from "@babel/helper-annotate-as-pure";
import {
  callExpression,
  cloneNode,
  isIdentifier,
  isThisExpression,
  yieldExpression,
} from "@babel/types";

const awaitVisitor = {
  Function(path) {
    path.skip();
  },

  AwaitExpression(path, { wrapAwait }) {
    const argument = path.get("argument");

    path.replaceWith(
      yieldExpression(
        wrapAwait
          ? callExpression(cloneNode(wrapAwait), [argument.node])
          : argument.node,
      ),
    );
  },
};

export default function (
  path: NodePath<any>,
  helpers: {
    wrapAsync: any;
    wrapAwait?: any;
  },
  noNewArrows?: boolean,
) {
  path.traverse(awaitVisitor, {
    wrapAwait: helpers.wrapAwait,
  });

  const isIIFE = checkIsIIFE(path);

  path.node.async = false;
  path.node.generator = true;

  wrapFunction(path, cloneNode(helpers.wrapAsync), noNewArrows);

  const isProperty =
    path.isObjectMethod() ||
    path.isClassMethod() ||
    path.parentPath.isObjectProperty() ||
    path.parentPath.isClassProperty();

  if (!isProperty && !isIIFE && path.isExpression()) {
    annotateAsPure(path);
  }

  function checkIsIIFE(path: NodePath) {
    if (path.parentPath.isCallExpression({ callee: path.node })) {
      return true;
    }

    // try to catch calls to Function#bind, as emitted by arrowFunctionToExpression in spec mode
    // this may also catch .bind(this) written by users, but does it matter? 🤔
    const { parentPath } = path;
    if (
      parentPath.isMemberExpression() &&
      isIdentifier(parentPath.node.property, { name: "bind" })
    ) {
      const { parentPath: bindCall } = parentPath;

      // (function () { ... }).bind(this)()

      return (
        // first, check if the .bind is actually being called
        bindCall.isCallExpression() &&
        // and whether its sole argument is 'this'
        bindCall.node.arguments.length === 1 &&
        isThisExpression(bindCall.node.arguments[0]) &&
        // and whether the result of the .bind(this) is being called
        bindCall.parentPath.isCallExpression({ callee: bindCall.node })
      );
    }

    return false;
  }
}
