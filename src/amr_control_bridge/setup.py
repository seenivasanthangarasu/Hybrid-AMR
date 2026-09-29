import os
from glob import glob
from setuptools import find_packages, setup

package_name = 'amr_control_bridge'

setup(
    name=package_name,
    version='0.1.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.launch.py')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='vasan',
    maintainer_email='seenivasanthangarasu@gmail.com',
    description='Server-side AMR Control Operations, Workspace State, and RPC Lifecycle Bridge',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'amr_control_bridge_node = amr_control_bridge.amr_control_bridge_node:main',
        ],
    },
)
