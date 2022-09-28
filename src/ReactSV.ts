const TranspilationError = (macroName: string) => {
    throw SyntaxError(`You tried to call '${macroName}' this is a macro that should be removed by your transpiler`)
}

export const $set = <T>(stateVar: T): React.Dispatch<React.SetStateAction<T>> => {
    TranspilationError("$set")
    return () => stateVar
}

export const $mutate = (mutatedValue: any): void => {
    TranspilationError("$mutate")
}

export const $local = <T>(localVar: any): T => {
    TranspilationError("$local")
    return localVar
}

export const $ = undefined
export const $cleanup = undefined

export const $component = (component: React.FunctionComponent<object>): React.FunctionComponent<object> => {
    TranspilationError("$component")
    return component
}

export const $notComponent = (notComponent: Function): Function => {
    TranspilationError("$notComponent")
    return notComponent
}