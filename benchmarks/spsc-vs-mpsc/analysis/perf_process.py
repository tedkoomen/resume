"""Count Linux software perf events across a child process and all its threads.
No perf CLI dependency. Counters cover exec, startup, benchmark and teardown.
"""
import ctypes, json, os, struct, time
import platform
if platform.machine() != 'x86_64': raise RuntimeError('perf wrapper currently supports x86_64 only')
libc=ctypes.CDLL(None,use_errno=True)
EVENTS={'task_clock_ns':1,'context_switches':3,'cpu_migrations':4,'page_faults':2}
def run(cmd,timeout=120):
    # Timeout is enforced by GNU timeout; timed-out descendants are killed as a group.
    rd,wr=os.pipe(); pid=os.fork()
    if pid==0:
        os.close(wr); os.read(rd,1); os.close(rd)
        os.execvp('timeout',['timeout','--signal=KILL',str(timeout),*cmd])
    os.close(rd); fds={};errors={}
    for name,config in EVENTS.items():
        buf=ctypes.create_string_buffer(128)
        # inherit + enable_on_exec, disabled until exec, user-space software events (kernel/hypervisor excluded).
        struct.pack_into('IIQQQQQ',buf,0,1,128,config,0,0,0,1|2|(1<<12)|(1<<5)|(1<<6))
        fd=libc.syscall(298,ctypes.byref(buf),pid,-1,-1,0)
        if fd<0:errors[name]=os.strerror(ctypes.get_errno())
        else:fds[name]=fd
    begin=time.monotonic();os.write(wr,b'x');os.close(wr)
    _,status,ru=os.wait4(pid,0)
    counts={}
    for name,fd in fds.items():
        counts[name]=struct.unpack('Q',os.read(fd,8))[0];os.close(fd)
    return dict(returncode=os.waitstatus_to_exitcode(status),wall_s=time.monotonic()-begin,
                user_s=ru.ru_utime,system_s=ru.ru_stime,**counts,
                rusage_context_switches=ru.ru_nvcsw+ru.ru_nivcsw,
                voluntary_context_switches=ru.ru_nvcsw,involuntary_context_switches=ru.ru_nivcsw,counter_errors=errors)
if __name__=='__main__':
    import sys
    result=run(sys.argv[2:]);open(sys.argv[1],'w').write(json.dumps(result))
    sys.exit(result['returncode'])
