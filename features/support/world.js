const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const assert = require('assert')
const mkdirp = require('mkdirp-promise')
const rmfr = require('rmfr')
const colors = require('colors')

const { setWorldConstructor, setDefaultTimeout, Before } = require('cucumber')

class CucumberElectronWorld {
  constructor() {
    this.tempDir = path.resolve(__dirname + '/../../tmp')
  }

  writeFile(filePath, contents) {
    const dir = path.resolve(path.join(this.tempDir, path.dirname(filePath)))
    return mkdirp(dir).then(() => {
      return new Promise((resolve, reject) => {
        fs.writeFile(path.join(this.tempDir, filePath), contents, err =>
          err ? reject(err) : resolve(err)
        )
      })
    })
  }

  runCommand(command, env) {
    const args = command.split(' ')
    args[0] = args[0].replace(/^cucumber-electron/, 'cucumber-electron.js')
    args[0] = path.resolve(__dirname + '/../../bin/' + args[0])

    return new Promise((resolve, reject) => {
      this.execResult = { stdout: '', stderr: '', output: '', exitCode: null }
      this.printExecResult = () =>
        '------------------------------------\n' +
        `The process exited with code ${this.spawnedProcess.exitCode}\n` +
        '------------------------------------\n' +
        `OUTPUT:\n${this.execResult.output}\n` +
        '------------------------------------\n' +
        `STDOUT:\n${this.execResult.stdout}\n` +
        '------------------------------------\n' +
        `STDERR:\n${this.execResult.stderr}\n` +
        '------------------------------------\n'

      const childEnv = Object.assign(process.env, env)
      this.spawnedProcess = spawn('node', args, { cwd: this.tempDir, env: childEnv })

      this.spawnedProcess.stdout.on('data', chunk => {
        this.execResult.stdout += chunk.toString()
        this.execResult.output += chunk.toString()
      })
      this.spawnedProcess.stderr.on('data', chunk => {
        this.execResult.stderr += chunk.toString()
        this.execResult.output += chunk.toString()
      })
      this.spawnedProcess.on('error', e => {
        reject(e)
      })
      this.spawnedProcess.on('exit', code => this.execResult.exitCode = code)
      resolve()
    })
  }

  ensureProcessHasExited() {
    if (this.spawnedProcess.exitCode == null) {
      return new Promise(resolve => {
        this.spawnedProcess.on('exit', code => {
          this.execResult.exitCode = code
          resolve()
        })
      })
    }
    return Promise.resolve()
  }

  assertProcessDidNotExit() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const exitCode = this.spawnedProcess.exitCode
        if (os.platform() === 'win32') {
          spawn('taskkill', ['/pid', this.spawnedProcess.pid, '/T', '/F'])
        } else {
          // LOL +2 seems to work for me
          process.kill(this.spawnedProcess.pid + 2)
        }
        if (exitCode === null) {
          resolve()
        } else {
          reject('The process exited unexpectedly\n' + this.printExecResult())
        }
      }, 500)
    })
  }

  assertProcessExitedWithCode(expectedExitCode) {
    return this.ensureProcessHasExited().then(() => {
      assert.equal(this.spawnedProcess.exitCode, expectedExitCode, this.printExecResult())
    })
  }

  assertOutputIncludes(expectedOutput, stream = 'output') {
    return this.ensureProcessHasExited().then(() => {
      const normalisedExpectedOutput = expectedOutput.replace('\r\n', '\n')
      const normalisedActualOutput = colors.strip(this.execResult[stream]).replace('\r\n', '\n')
      if (normalisedActualOutput.indexOf(normalisedExpectedOutput) == -1) {
        throw new Error(`Expected ${stream} to include:\n${normalisedExpectedOutput}\n` +
          this.printExecResult())
      }
    })
  }

  assertStdoutIncludes(expectedOutput) {
    return this.assertOutputIncludes(expectedOutput, 'stdout')
  }

  assertStderrIncludes(expectedOutput) {
    // On windows, everything goes out of stderr. Electron.exe needs a shim, or something
    const errorStream = os.platform() === 'win32' ? 'stdout' : 'stderr'
    return this.assertOutputIncludes(expectedOutput, errorStream)
  }
}

if (os.platform() === 'win32') {
  setDefaultTimeout(15000)
}

setWorldConstructor(CucumberElectronWorld)

Before(function () { return rmfr(this.tempDir) })
Before(function () { return mkdirp(this.tempDir) })
