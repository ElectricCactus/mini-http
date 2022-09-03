import { greet } from '.'

it('makes greeting', () => {
  expect(greet('world')).toEqual('hello, world')
})