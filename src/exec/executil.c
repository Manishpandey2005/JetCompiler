
#include <signal.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
#ifdef __APPLE__
#include <pthread.h>
#endif

#include "exec/executil.h"

typedef int (*JitFunction)();

static uint64_t hash(uint64_t x) {
  x = (x ^ (x >> 30)) * UINT64_C(0xbf58476d1ce4e5b9);
  x = (x ^ (x >> 27)) * UINT64_C(0x94d049bb133111eb);
  x = x ^ (x >> 31);
  return x;
}

void executeFunctionInMemory(void *mem, size_t len, int *ret) {
  int pid = fork();
  if (pid == -1) {
    *ret = EXIT_FORK_ERROR;
  } else if (pid == 0) {
    struct timeval time;
    gettimeofday(&time, NULL);
    srand(hash(time.tv_sec) ^ hash(time.tv_usec));
    // Allocate executable memory via mmap and copy JIT code into it.
    // On macOS, mprotect on malloc'd memory doesn't allow PROT_EXEC,
    // so we must use mmap with MAP_JIT to get executable pages.
    int mmap_flags = MAP_PRIVATE | MAP_ANONYMOUS;
#ifdef __APPLE__
    mmap_flags |= MAP_JIT;
#endif
    void *exec_mem =
        mmap(NULL, len, PROT_READ | PROT_WRITE | PROT_EXEC, mmap_flags, -1, 0);
    if (exec_mem == MAP_FAILED) {
      exit(EXIT_MEM_ERROR);
    }
#ifdef __APPLE__
    // On Apple Silicon, toggle JIT write protection to allow writing
    pthread_jit_write_protect_np(0);
#endif
    memcpy(exec_mem, mem, len);
#ifdef __APPLE__
    // Re-enable write protection so the memory becomes executable
    pthread_jit_write_protect_np(1);
#endif
    // Clear instruction cache to ensure the CPU sees the new code
    __builtin___clear_cache(exec_mem, (char *)exec_mem + len);
    JitFunction entry = (JitFunction)exec_mem;
    signal(SIGINT, SIG_DFL);
    entry();
    munmap(exec_mem, len);
    exit(EXIT_NORMAL);
  } else {
    waitpid(pid, ret, 0);
    if (WIFEXITED(*ret)) {
      *ret = WEXITSTATUS(*ret);
    } else if (WIFSIGNALED(*ret)) {
      *ret = EXIT_SIGNAL_ERROR_START + WTERMSIG(*ret);
    }
  }
}

void printMemoryContent(FILE *file, void *mem, size_t len) {
  fprintf(file, "memory at %p:\n", mem);
  for (size_t i = 0; i < len; i++) {
    if (i % 16 == 0) {
      fprintf(file, "  ");
    }
    fprintf(file, "%02hhx ", ((uint8_t *)mem)[i]);
    if (i % 16 == 15) {
      fprintf(file, "\n");
    }
  }
  if (len % 16 != 0) {
    fprintf(file, "\n");
  }
}
