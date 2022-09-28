import { useState } from 'react';
import * as React from 'react';
import TodoList from './TodoList';
import Selector from './Selector';
import ColorPicker from './ColorPicker';
import { $set as set, $mutate as mutate, $local as local, $, $cleanup, $state} from 'ReactSV';
// import './style.css';


React.memo()
const TodoApp = () => {

  const [state, setState] = useState(1)
  scopedStyles(css`
    h {
        background-color: red;
    }
  `)
  let fizz = {buzz: 3}
  let visibility = 'All';
  let themeColor = "#e66465";
  let localVar = $local(3)
  let notState = 1
  let arr = [1,2,3,4]
  $: console.log(other)
  $: {
    const other = themeColor
    console.log(other)
    $cleanup: console.log("cleanup")
  }
  function test() {
    
  }
  const func = function() {}
  notState = 5
  notState++
  //$set(arr)
  return (
    <div>
      <h1>Hello StackBlitz!</h1>
      <p>Start editing to see some magic happen ;)</p>
      <ColorPicker color={themeColor} setColor={(newThemeColor) => themeColor = newThemeColor}/>
      <Selector
        selected={visibility}
        setter={set(visibility)}
        options={['All', 'Open', 'Closed']}
        onClick={() => fizz.buzz++}
        onBlur={() => fizz.buzz = "dog"}
        onOther={() => {$mutate(arr.push(5))}}
      />
      <TodoList visibility={visibility} themeColor={themeColor} />
    </div>
  );
}

export default TodoApp