export type Challenge = {
  id: string;
  name: string;
  prompt: string;
  width: number;
  height: number;
  // Just the body content + scoped <style>. Reset CSS is added automatically
  // so target and user renderings share an identical baseline.
  targetBody: string;
  passThreshold: number;
};

export const challenges: Challenge[] = [
  {
    id: 'red-circle',
    name: '01 — Red Circle',
    prompt:
      'Render a 100×100 px red circle, centered on a 200×200 px white canvas.',
    width: 200,
    height: 200,
    targetBody: `<style>body{background:#fff;display:flex;align-items:center;justify-content:center}.c{width:100px;height:100px;background:#f00;border-radius:50%}</style><div class="c"></div>`,
    passThreshold: 0.97,
  },
];
