const generateCSSHash = () => {
    return `6920`
  }

  const merge = (arr1, arr2) => {
    let arr1Index = 0
    let arr2Index = 0
    const returnArr = []
    while (arr1Index < arr1.length && arr2Index < arr2.length) {
      returnArr.push(arr1[arr1Index])
      returnArr.push(arr2[arr2Index])
      arr1Index++
      arr2Index++
    }
    while (arr1Index < arr1.length) {
      returnArr.push(arr1[arr1Index])
      arr1Index++
    }
    return returnArr
  }

  const useScopedCSS = (path, node) => {
    const cssHash = generateCSSHash()
    const cssClass = `data-react-sv-${cssHash}`
    const templateVars = new Map()
    let addedCSSVarsToParent = false
    const cssVisitor = {
      TaggedTemplateExpression: (path) => {
        const {node} = path
        const {tag, quasi} = node
        const {quasis, expressions} = quasi
        if (!tag.name === localMacroNames.css) return
        let varNum = 0
        const templateVarExpressions = new Map()
        const expressionInterpolations = expressions.map((expression) => {
          const currVarNum = varNum++
          const varName = `$$css_var_${currVarNum}`
          const templateVarName = `--react-sv-css-var-${currVarNum}`
          templateVarExpressions.set(varName, expression)
          templateVars.set(templateVarName, varName)
          return `var(${templateVarName})`
        })
        const cssString = merge(quasis.map(quasi => quasi.value.raw), expressionInterpolations).join("")
        const {parentPath} = path
        const cssVarDeclarations = Array.from(templateVarExpressions.entries()).map(([varName, expression]) => {
          return t.variableDeclaration(
            "const",
            [t.variableDeclarator(
              t.identifier(varName), expression
            )]
          )
        })

        parentPath.replaceWithMultiple(
          [t.callExpression(
            t.identifier("scopedStyles"),
            [t.objectExpression(
              [t.ObjectProperty(
                t.identifier("css"), t.stringLiteral(cssString)
              ),
              t.ObjectProperty(
                t.identifier("className"), t.stringLiteral(cssClass)
              )]
            )]
          ),
          ...cssVarDeclarations]
        )

      },
      JSXOpeningElement: (path) => {
        const {node} = path
        node.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier(cssClass)
          )
        )
        if (!addedCSSVarsToParent) {
          node.attributes.push(
            t.jsxAttribute(
              t.jsxIdentifier("styles"),
              t.jsxExpressionContainer(
                t.objectExpression(
                  Array.from(templateVars.entries()).map(([key, val]) => {
                    return t.ObjectProperty(
                      t.identifier(key), t.identifier(val)
                    )
                  })
                )
              )
            )
          )
          addedCSSVarsToParent = true
        }
      }
    }
    path.scope.traverse(node, cssVisitor)
  }