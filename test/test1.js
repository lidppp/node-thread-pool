const {isMainThread, threadId, parentPort} = require("worker_threads")
let min = 2
if (!isMainThread) {
  parentPort.on("message", (data) => {
    let res = generatePrimes(data.start, data.step);
    console.log(`${threadId} success`);
    parentPort.postMessage(res)
  })
}

// 求质数
function generatePrimes(start, range) {
  let primes = []
  let isPrime = true
  let end = start + range
  for (let i = start; i < end; i++) {
    for (let j = min; j < Math.sqrt(end); j++) {
      if (i !== j && i % j === 0) {
        isPrime = false
        break
      }
    }
    if (isPrime) {
      primes.push(i)
    }
    isPrime = true
  }
  return primes
}
