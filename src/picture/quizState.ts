// 题目 ID 来自导入的绘本清单，可以是任意字符串；读取对象时必须忽略 constructor 等继承属性。
export function pictureQuizAnswer(answers: Readonly<Record<string, number>>, questionId: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(answers, questionId) ? answers[questionId] : undefined
}
