export default (babel) => {
  const { types: t } = babel;

  let $stateImported = false;
  let anyStateMacroImported = false;

  const componentIdentifierNames = new Set()

  const stateMacros = ["$set", "$mutate", "$local"];

  const defaultImportLocation = "ReactSV"
  let importLocation = defaultImportLocation

  const suppressed = {
    state: false,
    macro: false
  }

  const defaultMacroNames = {
    $set: "$set",
    $mutate: "$mutate",
    $local: "$local",
    $: "$",
    $cleanup: "$cleanup",
    $component: "$component",
    $notComponent: "$notComponent"
  };

  const localMacroNames = {
    $set: undefined,
    $mutate: undefined,
    $local: undefined,
    $: undefined,
    $cleanup: undefined,
    $component: undefined,
    $notComponent: undefined
  };

  const defaultSetterPrefix = "set"
  let setterPrefix = defaultSetterPrefix

  const getMemberExpressionBaseAndPath = (node, path = []) => {
    const { object, property } = node;
    if (t.isIdentifier(object)) {
      return [object, [property, ...path]];
    } else {
      return getMemberExpressionBaseAndPath(object, [property, ...path]);
    }
  };

  const generateGetterName = (varName) => {
    return `${setterPrefix}${varName[0].toUpperCase()}${varName.slice(1)}`;
  };

  const getStateVars = (path, node) => {
    const stateVars = new Map();
    const stateVarVisitor = {
      VariableDeclarator: (path) => {
        const { node } = path;
        const { id, init } = node;
        const varName = id.name;
        const isLocal = t.isCallExpression(init) && init.callee.name === localMacroNames.$local;
        if (isLocal) {
          node.init = init.arguments[0];
        } else {
          stateVars.set(varName, generateGetterName(varName));
        }
      },
      FunctionDeclaration: (path) => path.skip(),
      FunctionExpression: (path) => path.skip(),
      ArrowFunctionExpression: (path) => path.skip(),
      AssignmentExpression: (path) => {
        const assigneeName = path.node.left.name;
        stateVars.delete(assigneeName);
      },
      UpdateExpression: (path) => {
        const assigneeName = path.node.argument.name;
        stateVars.delete(assigneeName);
      },
      LabeledStatement: (path) => {
        const { node } = path;
        const { body, label } = node;
        if (label.name === localMacroNames.$) path.skip();
      }
    };
    path.scope.traverse(node, stateVarVisitor);
    return stateVars;
  };

  const generateValFunc = (operator, newVal) => {
    if (operator === "=") {
      return newVal;
    } else {
      return t.assignmentExpression(operator, t.identifier("val"), newVal);
    }
  };

  const useStateVars = (path, node, stateVars) => {
    const stateVisitor = {
      AssignmentExpression: (path) => {
        const { node } = path;
        const { right, operator } = node;
        const assignee = node.left;
        const assigneeName = assignee.name;
        if (t.isMemberExpression(assignee)) {
          const [base, propPath] = getMemberExpressionBaseAndPath(assignee);
          const baseName = base.name;
          if (stateVars.has(baseName)) {
            const newValFunc = generateValFunc(operator, right);
            path.replaceWith(
              t.callExpression(t.identifier(stateVars.get(baseName)), [
                t.callExpression(t.identifier("$$deepUpdate"), [
                  base,
                  t.arrayExpression(propPath.map((id) => t.stringLiteral(id.name))),
                  t.arrowFunctionExpression([t.identifier("val")], newValFunc)
                ])
              ])
            );
          }
        } else {
          if (stateVars.has(assigneeName)) {
            if (operator === "=") {
              path.replaceWith(t.callExpression(t.identifier(stateVars.get(assigneeName)), [right]));
            } else {
              path.replaceWith(t.callExpression(t.identifier(stateVars.get(assigneeName)), [t.arrowFunctionExpression([assignee], node)]));
              path.skip();
            }
          }
        }
      },
      CallExpression: (path) => {
        const { node } = path;
        const funcName = node.callee.name;
        if (funcName === localMacroNames.$set) {
          const stateVarName = node.arguments[0].name;
          path.replaceWith(t.identifier(stateVars.get(stateVarName)));
        } else if (funcName === localMacroNames.$mutate) {
          const setter = node.arguments[0];
          const [base, _] = getMemberExpressionBaseAndPath(setter.callee);
          let stateSetter = t.identifier(stateVars.get(base.name));
          path.replaceWithMultiple(
            setter,
            t.callExpression(
              stateSetter,
              [base]
            )
            /*t.callExpression(t.identifier("$$mutateAndSet"), [setter, base, stateSetter])*/
          );
        }
      },
      UpdateExpression: (path) => {
        const { node } = path;
        const { operator } = node;
        const assignee = node.argument;
        if (t.isMemberExpression(assignee)) {
          const [base, propPath] = getMemberExpressionBaseAndPath(assignee);
          const baseName = base.name;
          if (stateVars.has(baseName)) {
            path.replaceWith(
              t.callExpression(t.identifier(stateVars.get(baseName)), [
                t.callExpression(t.identifier("$$deepUpdate"), [
                  base,
                  t.arrayExpression(propPath.map((id) => t.stringLiteral(id.name))),
                  t.arrowFunctionExpression([t.identifier("val")], t.updateExpression(operator, t.identifier("val"), true))
                ])
              ])
            );
          }
        } else {
          const assigneeName = assignee.name;
          if (stateVars.has(assigneeName)) {
            //postfix doesn't work since the update occurs after the value is read
            node.prefix = true;
            path.replaceWith(t.callExpression(t.identifier(stateVars.get(assigneeName)), [t.arrowFunctionExpression([assignee], node)]));
            path.skip();
          }
        }
      },
      VariableDeclarator: (path) => {
        const { node } = path;
        const { id, init } = node;
        const varName = id.name;
        if (stateVars.has(varName)) {
          path.replaceWith(
            t.variableDeclarator(t.arrayPattern([id, t.identifier(stateVars.get(varName))]), t.callExpression(t.identifier("useState"), [init]))
          );
          path.skip();
        }
      }
    };
    path.scope.traverse(node, stateVisitor);
  };

  const cleanupVisitor = {
    LabeledStatement: (path) => {
      const { node } = path;
      const { body, label } = node;

      if (label.name === localMacroNames.$cleanup) {
        const returnVal = t.isExpressionStatement(body) ? body.expression : body;
        const returnFunc = t.arrowFunctionExpression([], returnVal);
        path.replaceWith(t.returnStatement(returnFunc));
      }
    }
  };

  const memberExpressionToString = (memberExpression) => {
    const [base, path] = getMemberExpressionBaseAndPath(memberExpression);
    return `${base.name}.${path.map((id) => id.name).join(".")}`;
  };

  const getDependencies = (path, node) => {
    console.log({ node });
    const dependencies = new Set();
    const memberExpressionDependecyStrings = new Set();
    const locals = new Set([localMacroNames.$]);
    const dependencyVisitor = {
      VariableDeclarator: (path) => {
        const varName = path.node.id.name;
        locals.add(varName);
      },
      Identifier: (path) => {
        const { node } = path;
        const varName = node.name;
        //console.log({ varName });
        if (!locals.has(varName)) dependencies.add(node);
      },
      MemberExpression: (path) => {
        const { node } = path;
        const [base, _] = getMemberExpressionBaseAndPath(node);
        const varName = base.name;
        console.log({ varName });
        if (!locals.has(varName)) {
          const memberExpressionString = memberExpressionToString(node);
          if (!memberExpressionDependecyStrings.has(memberExpressionString)) {
            memberExpressionDependecyStrings.add(memberExpressionString);
            dependencies.add(node);
          }
        }
        path.skip();
      }
    };
    path.scope.traverse(node, dependencyVisitor);
    return Array.from(dependencies);
  };

  const addEffects = (path, node) => {
    const effectVisitor = {
      LabeledStatement: (path) => {
        const { node } = path;
        const { body, label } = node;
        if (label.name === localMacroNames.$) {
          const effectBody = t.isExpressionStatement(body) ? body.expression : body;
          path.scope.traverse(node, cleanupVisitor);
          const effectFunc = t.arrowFunctionExpression([], effectBody);
          const deps = getDependencies(path, node); //.map(dep => t.stringLiteral(dep));
          path.replaceWith(t.callExpression(t.identifier("useEffect"), [effectFunc, t.arrayExpression(deps)]));
        }
      }
    };
    path.scope.traverse(node, effectVisitor);
  };

  const useMacro = (macroName, localMacroName) => {
    if (macroName === "$state") {
      $stateImported = true;
    } else if (localMacroNames.hasOwnProperty(macroName)) {
      if (stateMacros.includes(macroName)) anyStateMacroImported = true;
      localMacroNames[macroName] = localMacroName;
    } else {
      if (!suppressed.macro) throw Error(`
            Unknown macro "${macroName}"
            There are two possible causes for this:
            - You attempted to import a macro that doesn't exist (ie. import {${macroName}} from '${importLocation}')
            - You added a macro to your global macros that doesn't exist ie.
            {
                "global": true
                "globalMacros": {
                    ...,
                    "${macroName}": "something"
                    ...
                }
            }
            or 
            {
                "global": true
                "globalMacros": [..., "${macroName}" ...]
            }

            To supress this error add the following to your config: 
            {
              "suppressed": [..."macro", ...]
            }
            `);
    }
  };

  const usePluginOptions = (pluginOptions) => {
    $stateImported = false;
    anyStateMacroImported = false;

    Object.entries(localMacroNames).forEach(([macroName, _]) => {
      localMacroNames[macroName] = undefined
    })

    if (pluginOptions.global) {
      const globalsOptions = pluginOptions.globalMacros;
      if (globalsOptions) {
        if (Array.isArray(globalsOptions)) {
          globalsOptions.forEach((macroName) => useMacro(macroName, macroName));
        } else {
          Object.entries(globalsOptions).forEach(([macroName, localMacroName]) => useMacro(macroName, localMacroName));
        }
      } else {
        $stateImported = true;
        Object.entries(localMacroNames).forEach(([macroName, _]) => useMacro(macroName, defaultMacroNames[macroName]));
      }
    }

    Object.keys(suppressed).forEach(key => suppressed[key] = false)

    if (pluginOptions.suppressed) {
      pluginOptions.suppressed.forEach(suppressedError => suppressed[suppressedError] = true)
    }

    setterPrefix = pluginOptions.setterPrefix ?? defaultSetterPrefix
    importLocation = pluginOptions.importLocation ?? defaultImportLocation
  };

  const visitComponent = (path, node) => {
    if ($stateImported) {
      const stateVars = getStateVars(path, node);
      useStateVars(path, node, stateVars);
    } else {
      if (anyStateMacroImported) {
        const stateMacrosList = stateMacros.map((stateMacro) => `"${stateMacro}"`).join(", ");
        if (!suppressed.state) throw Error(`
            You appear to have imported one or more state related macros (ie. ${stateMacrosList} or "${stateMacros[stateMacros.length - 1]}")
            without also importing the "$state" macro. These macros will not work unless you also import "$state". 
            Possible solutions:
            - If you want to use these macros, add an import for "$state" ie. import {$state} from '${importLocation}'
            - If you don't want to use these macros then remove the imports for them
            - If you want to enable the "$state" macro globally add it to the "global" section of your plugin config
            - If you have a use case that is not covered by one of these three options please contact me

            To supress this error add the following to your config: 
            {
              "suppressed": [..."state", ...]
            }
            `);
      }
    }
    if (localMacroNames.$) addEffects(path, node);
    path.skip();
  }

  return {
    visitor: {
      Program: (path, state) => {
        const { node } = path
        usePluginOptions(state.opts);
        const componentFinderVisitor = {
          CallExpression: (path) => {
            const { node } = path;
            const { callee, arguments: args } = node;
            if (callee.name === localMacroNames.$component) {
              if (args.length !== 1) {
                const localNameWarning = localMacroNames.$component !== defaultMacroNames.$component ? ` (imported as '${localMacroNames.$component}')` : ""
                throw Error(
                  `The '$component' macro${localNameWarning} requires a single argument`
                )
              }
              const component = args[0]
              if (t.isIdentifier(component)) {
                componentIdentifierNames.add(component.name)
              } else if (t.isArrowFunctionExpression(component) || t.isFunctionExpression(component)) {
                visitComponent(path, component)
              }
              path.replaceWith(component)
            }
          },
          ImportSpecifier: (path, state) => {
            const { node } = path;
            const { local, imported } = node;
            const parentImport = path.parentPath.node;
            if (parentImport.source.value !== importLocation) return;
            useMacro(imported.name, local.name);
          },
          ExportDefaultDeclaration: (path) => {
            const { node } = path
            const { declaration } = node
            if (t.isIdentifier(declaration)) componentIdentifierNames.add(declaration.name)
          },
          ExportNamedDeclaration: (path) => {
            path.node.specifiers.forEach(specifier => {
                if (t.isExportNamespaceSpecifier(specifier) || t.isExportDefaultSpecifier(specifier)) return
                const { local, exported } = specifier
                componentIdentifierNames.add(local.name)
            })
          }
        }
        path.scope.traverse(node, componentFinderVisitor)
      },
      VariableDeclarator: (path) => {
        const { node } = path;
        const { id, init } = node
        if (componentIdentifierNames.has(id.name)) {
          if (t.isCallExpression(init) && init.callee.name === localMacroNames.$notComponent) {
            const args = init.arguments
            if (args.length !== 1) {
              const localNameWarning = localMacroNames.$notComponent !== defaultMacroNames.$notComponent ? ` (imported as '${localMacroNames.$notComponent}')` : ""
              throw Error(
                `The '$notComponent' macro${localNameWarning} requires a single argument`
              )
            }
            node.init = args[0]
            return
          }
          visitComponent(path, init)
        }
      }
    }
  };
};
